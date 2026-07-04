// scripts/syncFideElos.js
// Sincronización mensual de ELOs desde FIDE a Firestore.
// Corre en el PC local (IP no bloqueada por FIDE).
//
// Lógica:
//   - Descarga el ZIP oficial de FIDE con todos los ELOs del mundo (12 MB).
//   - Solo actualiza Firestore si cambió el mes desde la última sincronización.
//   - Verifica system_metadata/last_fide_update para decidir.
//
// Uso:
//   node syncFideElos.js            (modo auto mensual)
//   node syncFideElos.js --force    (forzar aunque ya se haya actualizado este mes)
//
// Requiere el archivo scripts/firebase-sa.json (service account de Firebase,
// NO se sube al repo - está en .gitignore).

const admin = require("firebase-admin");
const axios = require("axios");
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");

// --- Constantes ---
const ELO_MIN = 100;
const ELO_MAX = 3500;
const MONTHLY_WINDOW_END_DAY = 12;
const FIDE_ZIP_URL = "https://ratings.fide.com/download/standard_rating_list.zip";
const SA_PATH = path.join(__dirname, "firebase-sa.json");

// --- Logging con timestamp ---
function log(msg, level = "info") {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${level.toUpperCase()}: ${msg}`;
    if (level === "error") console.error(line);
    else console.log(line);
}

// --- Inicialización Firebase ---
if (!fs.existsSync(SA_PATH)) {
    log(`ERROR: No se encuentra ${SA_PATH}`, "error");
    log(`Descarga el JSON del service account desde Firebase Console y guárdalo ahí.`, "error");
    process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(SA_PATH, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// --- Parsea el .txt del ZIP oficial de FIDE ---
function parseFideTxt(txt) {
    const lines = txt.split(/\r?\n/);
    if (lines.length < 2) throw new Error("ZIP FIDE vacío o sin datos.");

    const header = lines[0];
    const monthMatch = header.match(/[A-Z]{3}\d{2}/);
    if (!monthMatch) throw new Error("No se encontró columna de rating en cabecera FIDE.");
    const ratingStart = monthMatch.index;
    const ratingEnd = ratingStart + monthMatch[0].length;
    const nameStartIdx = header.indexOf("Name");
    if (nameStartIdx < 0) throw new Error("No se encontró columna 'Name' en cabecera FIDE.");
    const idEnd = nameStartIdx;
    const fedStartIdx = header.indexOf("Fed");

    const results = new Map();
    let parsed = 0;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || !line.trim()) continue;
        const idStr = line.substring(0, idEnd).trim();
        const id = parseInt(idStr, 10);
        if (!id) continue;
        const ratingStr = line.substring(ratingStart, ratingEnd).trim();
        const rating = parseInt(ratingStr, 10);
        let name = "";
        if (fedStartIdx > nameStartIdx) name = line.substring(nameStartIdx, fedStartIdx).trim();
        results.set(String(id), { elo: rating || 0, name });
        parsed++;
    }
    log(`ZIP FIDE parseado: ${parsed} jugadores, columna rating '${monthMatch[0]}' en pos ${ratingStart}-${ratingEnd}`);
    return results;
}

// --- Descarga y parsea el ZIP oficial de FIDE ---
async function downloadFideZip() {
    log(`Descargando ZIP oficial FIDE: ${FIDE_ZIP_URL}`);
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
}

// --- Helper: registra auditoría en update_logs ---
async function logRun(result) {
    try {
        await db.collection("update_logs").add({
            type: "pc-sync/" + (result.mode || "auto"),
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

// --- Main ---
(async () => {
    const FORCE = process.argv.includes("--force");
    const today = new Date();
    const day = today.getUTCDate();
    log(`Inicio sincronización. FORCE=${FORCE} día=${day}`);

    // 1. Verificar si ya se actualizó este mes (salvo --force)
    if (!FORCE) {
        const metadataRef = db.collection("system_metadata").doc("last_fide_update");
        const meta = await metadataRef.get();
        if (meta.exists) {
            const ts = meta.data()?.timestamp;
            if (ts && ts.toDate instanceof Function) {
                const last = ts.toDate();
                const sameMonth = last.getUTCFullYear() === today.getUTCFullYear()
                    && last.getUTCMonth() === today.getUTCMonth();
                if (sameMonth) {
                    log(`Ya actualizado este mes (${last.toISOString()}). Nada que hacer.`);
                    process.exit(0);
                }
            }
        }
        // Si día > 12, aún intentamos (última oportunidad). Si día < 1, esperamos.
        // Si día 1-12, procedemos.
        // No bloqueamos por día: descarga ZIP está disponible desde día 3, pero intentarlo
        // antes no hace daño (si ZIP no actualizado, los ELO no cambian y no marca el mes).
    }

    // 2. Descargar ZIP
    let eloMap;
    try {
        eloMap = await downloadFideZip();
    } catch (e) {
        log(`Fallo descarga ZIP: ${e.message}`, "error");
        await logRun({ checked: 0, updated: 0, errored: 1, message: "ZIP fallido: " + e.message, ok: false });
        process.exit(1);
    }

    // 3. Leer jugadores de Firestore
    const snapshot = await db.collection("players").get();
    if (snapshot.empty) {
        log("No hay jugadores en Firestore.");
        await logRun({ checked: 0, updated: 0, errored: 0, message: "Sin jugadores", ok: true });
        process.exit(0);
    }
    const players = [];
    snapshot.forEach(doc => players.push({ id: doc.id, ...doc.data() }));
    log(`Jugadores a revisar: ${players.length}`);

    // 4. Actualizar cada jugador
    let checked = 0, updated = 0, errored = 0;
    for (const player of players) {
        checked++;
        if (!player.fideId) { log(`Jugador ${player.id} sin fideId, omito.`); continue; }
        const fideId = String(player.fideId);
        const entry = eloMap.get(fideId);
        if (!entry) {
            // No está en ZIP FIDE = sin rating estándar (inactivo). Mantenemos ELO existente.
            log(`Jugador ${fideId} (${player.name || 'SN'}) no está en ZIP FIDE. Mantiene ELO ${player.elo}.`);
            continue;
        }
        const newElo = entry.elo;
        const newName = entry.name || player.name;
        const valid = newElo >= ELO_MIN && newElo <= ELO_MAX;
        if (!valid) {
            log(`ELO no fiable para ${player.name} (${fideId}): ${newElo}. No se sobrescribe.`);
            errored++;
            continue;
        }
        if (newElo !== player.elo || newName !== player.name) {
            try {
                await db.collection("players").doc(player.id).update({
                    elo: newElo,
                    name: newName,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                });
                updated++;
                log(`Actualizado ${player.name} -> ${newName} ELO ${newElo}`);
            } catch (e) {
                errored++;
                log(`Error actualizando ${fideId}: ${e.message}`, "error");
            }
        } else {
            log(`Sin cambios ${player.name} (${fideId}) ELO=${newElo}`);
        }
    }

    const ok = errored === 0 || (checked > 0 && errored / checked <= 0.10);
    const msg = `revisados ${checked}, actualizados ${updated}, errores ${errored}`;
    log(`Resultado final: ${msg} (ok=${ok})`);

    // 5. Marcar el mes como hecho + log
    await logRun({ checked, updated, errored, message: msg, ok });
    if (ok) {
        await db.collection("system_metadata").doc("last_fide_update")
            .set({ timestamp: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        log("system_metadata/last_fide_update actualizado.");
    }

    process.exit(ok ? 0 : 1);
})().catch(async (e) => {
    log(`Error FATAL: ${e.message}`, "error");
    try { await logRun({ checked: 0, updated: 0, errored: 1, message: "FATAL: " + e.message, ok: false }); } catch (_) {}
    process.exit(1);
});