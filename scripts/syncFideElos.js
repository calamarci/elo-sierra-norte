// scripts/syncFideElos.js
// Sincronización mensual de ELOs desde FIDE a Firestore.
// Corre en GitHub Actions (IPs de GitHub, no bloqueadas por FIDE).
//
// Estrategias (en orden):
//   1. Scraping directo de ratings.fide.com/profile/{id} (día 1-2 del mes)
//   2. Fallback: descargar ZIP oficial con TODOS los ELOs (día 3+, garantizado)
//
// Modos (recibidos por env):
//   MODE = "auto"   -> decide según día del mes
//   MODE = "scrape" -> solo scraping
//   MODE = "zip"    -> solo ZIP
//   TARGET_IDS = "id1,id2,..." -> actualizar solo esos FIDE IDs (vacío = todos jugadores Firestore)
//   FORCE = "true"  -> forzar actualización sin importar lógica mensual

const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");
const AdmZip = require("adm-zip");

// --- Constantes ---
const ELO_MIN = 100;
const ELO_MAX = 3500;
const SCRAPE_RETRIES = 2;
const SCRAPE_BACKOFF_MS = 1000;
const INTER_PLAYER_DELAY_MS = 300;
const ERROR_RATE_THRESHOLD = 0.10;
const MONTHLY_WINDOW_END_DAY = 12;
const FIDE_ZIP_URL = "https://ratings.fide.com/download/standard_rating_list.zip";

// --- Inicialización Firebase ---
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// --- Logging con timestamp ---
function log(msg, level = "info") {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${level.toUpperCase()}: ${msg}`;
    if (level === "error") console.error(line);
    else console.log(line);
}

// --- Parsea el .txt del ZIP oficial de FIDE ---
// Formato ancho fijo: la columna del rating se identifica por el patrón MES+Año (JUL26, etc.)
// Devuelve un Map<fideId, elo>.
function parseFideTxt(txt) {
    const lines = txt.split(/\r?\n/);
    if (lines.length < 2) throw new Error("ZIP FIDE vacío o sin datos.");

    const header = lines[0];

    // Buscar la columna del rating: 3 letras + 2 dígitos (p.ej. JUL26)
    const monthMatch = header.match(/[A-Z]{3}\d{2}/);
    if (!monthMatch) throw new Error("No se encontró columna de rating en cabecera FIDE.");
    const ratingStart = monthMatch.index;
    const ratingEnd = ratingStart + monthMatch[0].length;

    // El ID ocupa desde el inicio hasta donde empieza "Name"
    const nameStartIdx = header.indexOf("Name");
    if (nameStartIdx < 0) throw new Error("No se encontró columna 'Name' en cabecera FIDE.");
    const idEnd = nameStartIdx;

    // También el nombre: desde nameStartIdx hasta "Fed"
    const fedStartIdx = header.indexOf("Fed");

    const results = new Map();
    let parsed = 0;
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || !line.trim()) continue;
        const idStr = line.substring(0, idEnd).trim();
        const id = parseInt(idStr, 10);
        if (!id) { skipped++; continue; }
        const ratingStr = line.substring(ratingStart, ratingEnd).trim();
        const rating = parseInt(ratingStr, 10);
        let name = "";
        if (fedStartIdx > nameStartIdx) {
            name = line.substring(nameStartIdx, fedStartIdx).trim();
        }
        results.set(String(id), { elo: rating || 0, name });
        parsed++;
    }
    log(`ZIP FIDE parseado: ${parsed} jugadores, ${skipped} líneas inválidas.`);
    return results;
}

// --- Descarga y parsea el ZIP oficial de FIDE ---
// FIDE sirve el ZIP lentamente; usamos timeout holgado + reintentos.
async function downloadFideZip() {
    const MAX_ATTEMPTS = 3;
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        log(`Descargando ZIP oficial FIDE (intento ${attempt}/${MAX_ATTEMPTS}): ${FIDE_ZIP_URL}`);
        try {
            const response = await axios.get(FIDE_ZIP_URL, {
                responseType: "arraybuffer",
                timeout: 300000,
                maxRedirects: 5,
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36" },
            });
            if (response.status !== 200) throw new Error(`FIDE ZIP respondió status ${response.status}`);
            const buf = Buffer.from(response.data);
            log(`ZIP descargado: ${Math.round(buf.length / 1024)} KB`);
            const zip = new AdmZip(buf);
            const txtEntry = zip.getEntries().find(e => e.entryName.endsWith(".txt"));
            if (!txtEntry) throw new Error("ZIP FIDE no contenía archivo .txt");
            const txt = txtEntry.getData().toString("utf8");
            return parseFideTxt(txt);
        } catch (e) {
            lastErr = e;
            log(`Intento ${attempt} fallido: ${e.message}`, "error");
            if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 5000));
        }
    }
    throw lastErr;
}

// --- Scraping directo de un perfil FIDE (día 1-2) ---
async function scrapeProfile(fideId) {
    const url = `https://ratings.fide.com/profile/${fideId}`;
    const response = await axios.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
        timeout: 15000,
        validateStatus: s => s < 500,
        maxRedirects: 5,
    });
    if (response.status === 404) throw new Error(`FIDE 404: jugador no existe`);
    if (response.status !== 200) throw new Error(`FIDE respondió status ${response.status}`);

    const $ = cheerio.load(response.data);
    const name = $(".player-title").first().text().trim();
    if (!name) throw new Error("No se encontró el nombre");
    const eloText = $(".profile-standart.profile-game p").first().text().trim();
    const elo = parseInt(eloText, 10);
    const valid = !isNaN(elo) && elo >= ELO_MIN && elo <= ELO_MAX;
    return { name, elo: valid ? elo : 0, valid };
}

async function scrapeWithRetries(fideId) {
    let lastErr = null;
    for (let a = 1; a <= SCRAPE_RETRIES; a++) {
        try { return await scrapeProfile(fideId); }
        catch (e) {
            lastErr = e;
            if (a < SCRAPE_RETRIES) await new Promise(r => setTimeout(r, SCRAPE_BACKOFF_MS * Math.pow(2, a - 1)));
        }
    }
    throw lastErr;
}

// --- Lee los jugadores de Firestore (o usa TARGET_IDS si vino por input) ---
async function readPlayers(targetIdsStr) {
    const snapshot = await db.collection("players").get();
    const players = [];
    if (targetIdsStr && targetIdsStr.trim()) {
        // Modo manual: solo los IDs pedidos, leemos sus docs para tener el fideId y elo actual
        const wanted = new Set(targetIdsStr.split(",").map(s => s.trim()).filter(Boolean));
        snapshot.forEach(doc => {
            const p = doc.data();
            if (p.fideId && wanted.has(String(p.fideId))) players.push({ id: doc.id, ...p });
        });
    } else {
        snapshot.forEach(doc => players.push({ id: doc.id, ...doc.data() }));
    }
    return players;
}

// --- Main ---
(async () => {
    const MODE = process.env.MODE || "auto";
    const TARGET_IDS = process.env.TARGET_IDS || "";
    const FORCE = process.env.FORCE === "true";
    const today = new Date();
    const day = today.getUTCDate();
    log(`Inicio sincronización. MODE=${MODE} TARGET_IDS='${TARGET_IDS}' FORCE=${FORCE} día=${day}`);

    // Para modo auto con targetIds (añadir jugador nuevo): siempre scrape directo
    let effectiveMode = MODE;
    if (MODE === "auto") {
        if (TARGET_IDS) {
            effectiveMode = "scrape";
            log("Modo auto con TARGET_IDS -> scraping directo (altas nuevas).");
        } else if (day >= 3) {
            effectiveMode = "zip";
            log(`Día ${day} >= 3 -> ZIP oficial (garantizado).`);
        } else {
            effectiveMode = "scrape";
            log(`Día ${day} 1-2 -> scraping directo.`);
        }
    }

    const players = await readPlayers(TARGET_IDS);
    if (players.length === 0) {
        log("No hay jugadores para actualizar.");
        await logRun({ checked: 0, updated: 0, errored: 0, message: "Sin jugadores", ok: true, mode: effectiveMode });
        return;
    }
    log(`Jugadores a actualizar: ${players.length}`);

    // --- FASE 1: Obtener ELOs刷新 ---
    let eloMap = null; // solo zip
    let errored = 0;
    let updated = 0;
    let checked = 0;

    if (effectiveMode === "zip") {
        try {
            eloMap = await downloadFideZip();
        } catch (e) {
            log(`Fallo descarga ZIP: ${e.message}`, "error");
            await logRun({ checked: 0, updated: 0, errored: players.length, message: "ZIP fallido: " + e.message, ok: false, mode: effectiveMode });
            process.exit(1);
        }
    }

    // --- FASE 2: Actualizar cada jugador ---
    for (const player of players) {
        checked++;
        if (!player.fideId) { log(`Jugador ${player.id} sin fideId, omito.`); continue; }
        const fideId = String(player.fideId);

        try {
            let newName = "";
            let newElo = 0;
            let valid = false;

            if (effectiveMode === "zip" && eloMap) {
                const entry = eloMap.get(fideId);
                if (!entry) {
                    // No encontrado en ZIP = jugador sin rating estándar actualmente (inactivo,
                    // sin partidas, etc.). Mantenemos ELO existente, NO es un error.
                    log(`Jugador ${fideId} (${player.name || 'SN'}) no está en ZIP FIDE. Mantiene ELO ${player.elo}.`);
                    continue;
                }
                newName = entry.name || player.name;
                newElo = entry.elo;
                valid = newElo >= ELO_MIN && newElo <= ELO_MAX;
            } else {
                const s = await scrapeWithRetries(fideId);
                newName = s.name; newElo = s.elo; valid = s.valid;
            }

            if (!valid) {
                errored++;
                log(`ELO no fiable para ${player.name} (${fideId}): ${newElo}. No sobrescribe.`);
            } else if (newElo !== player.elo || newName !== player.name) {
                await db.collection("players").doc(player.id).update({
                    elo: newElo,
                    name: newName,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                });
                updated++;
                log(`Actualizado ${player.name} -> ELO ${newElo}`);
            } else {
                log(`Sin cambios ${player.name} (${fideId}) ELO=${newElo}`);
            }
        } catch (e) {
            errored++;
            log(`Error ${fideId}: ${e.message}`, "error");
        }
        await new Promise(r => setTimeout(r, INTER_PLAYER_DELAY_MS));
    }

    // --- FASE 3: fallback ZIP si scraping falló masivamente ---
    let finalErrored = errored;
    let finalUpdated = updated;
    if (effectiveMode === "scrape" && checked > 0 && (errored / checked) > ERROR_RATE_THRESHOLD && day >= 3) {
        log(`Scraping falló >${(ERROR_RATE_THRESHOLD * 100).toFixed(0)}% (${errored}/${checked}). Activando fallback ZIP.`);
        try {
            eloMap = await downloadFideZip();
            // reintento solo los que fallaron
            for (const player of players) {
                if (!player.fideId) continue;
                const fideId = String(player.fideId);
                const entry = eloMap.get(fideId);
                if (!entry) continue;
                const newElo = entry.elo;
                if (newElo >= ELO_MIN && newElo <= ELO_MAX && newElo !== player.elo) {
                    await db.collection("players").doc(player.id).update({
                        elo: newElo,
                        name: entry.name || player.name,
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    finalUpdated++;
                    finalErrored--;
                    log(`Fallback ZIP actualiza ${player.name} -> ELO ${newElo}`);
                }
            }
        } catch (e) {
            log(`Fallback ZIP también falló: ${e.message}`, "error");
        }
    }

    const errorRate = checked > 0 ? finalErrored / checked : 0;
    const ok = errorRate <= ERROR_RATE_THRESHOLD;
    const msg = `${effectiveMode}: revisados ${checked}, actualizados ${finalUpdated}, errores ${finalErrored}`;
    log(`Resultado final: ${msg} (ok=${ok})`);

    // --- FASE 4: marcar el mes + log ---
    await logRun({ checked, updated: finalUpdated, errored: finalErrored, message: msg, ok, mode: effectiveMode });

    if (ok && !TARGET_IDS) {
        // Solo en modo mensual sin targetIds: marca el mes como hecho
        await db.collection("system_metadata").doc("last_fide_update")
            .set({ timestamp: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        log("system_metadata/last_fide_update actualizado.");
    }

    process.exit(ok ? 0 : 1);
})().catch(async (e) => {
    log(`Error FATAL: ${e.message}`, "error");
    try { await logRun({ checked: 0, updated: 0, errored: 1, message: "FATAL: " + e.message, ok: false, mode: process.env.MODE || "auto" }); } catch (_) {}
    process.exit(1);
});

// --- Helper: escribe en update_logs ---
async function logRun(result) {
    try {
        await db.collection("update_logs").add({
            type: "github-actions/" + (result.mode || "auto"),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            checked: result.checked || 0,
            updated: result.updated || 0,
            errored: result.errored || 0,
            message: result.message || "",
            ok: result.ok === undefined ? true : result.ok,
        });
    } catch (e) {
        log(`No se pudo escribir en update_logs: ${e.message}`, "error");
    }
}