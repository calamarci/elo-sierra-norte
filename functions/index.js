// --- INICIO COMPLETO de functions/index.js ---

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");

// Inicialización (asegurar que solo se haga una vez)
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

// --- Función Auxiliar para Scraping (Leer datos de FIDE) ---
// Esta función se usa tanto en la actualización automática como en la manual y al añadir jugador.
async function scrapeFideProfile(fideId) {
    const url = `https://ratings.fide.com/profile/${fideId}`;
    functions.logger.info(`Iniciando scraping para FIDE ID: ${fideId} en URL: ${url}`);

    let html = '';

    // Lista de estrategias para obtener el HTML (se prueban en orden)
    const strategies = [
        {
            name: 'Directo',
            getUrl: () => url,
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            }
        },
        {
            name: 'corsproxy.io',
            getUrl: () => `https://corsproxy.io/?${encodeURIComponent(url)}`,
            timeout: 15000,
            headers: {}
        },
        {
            name: 'corsproxy.org',
            getUrl: () => `https://corsproxy.org/?${encodeURIComponent(url)}`,
            timeout: 15000,
            headers: {}
        },
        {
            name: 'AllOrigins',
            getUrl: () => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            timeout: 15000,
            headers: {}
        }
    ];

    let lastError = null;
    for (const strategy of strategies) {
        try {
            const response = await axios.get(strategy.getUrl(), {
                headers: strategy.headers,
                timeout: strategy.timeout,
                validateStatus: status => status < 500
            });

            if (response.status === 200 && response.data) {
                html = response.data;
                functions.logger.info(`Scraping exitoso usando estrategia: ${strategy.name}`);
                break; // Éxito, salir del bucle
            } else if (response.status === 404) {
                throw new functions.https.HttpsError('not-found', `FIDE retornó 404. No existe el jugador.`);
            } else {
                functions.logger.warn(`Estrategia ${strategy.name} retornó status ${response.status}. Intentando siguiente...`);
            }
        } catch (error) {
            // Si es un error 404 real, no reintentar
            if (error.code === 'functions/not-found' || (error.response && error.response.status === 404)) {
                throw error;
            }
            lastError = error;
            functions.logger.warn(`Estrategia ${strategy.name} falló: ${error.message}. Intentando siguiente...`);
        }
    }

    if (!html) {
        functions.logger.error(`Todas las estrategias fallaron para FIDE ID ${fideId}. Último error: ${lastError?.message}`);
        throw new functions.https.HttpsError('deadline-exceeded', `FIDE no responde tras intentar todas las estrategias.`);
    }

    try {
        if (!html) throw new Error("HTML vacío tras intentos.");

        const $ = cheerio.load(html);
        const nameSelector = '.player-title';
        const eloSelector = '.profile-standart.profile-game p';
        const name = $(nameSelector).first().text().trim();
        let elo = 0;
        let foundElo = false;
        const eloElement = $(eloSelector).first();
        if (eloElement.length > 0) {
            const eloText = eloElement.text().trim();
            const parsedElo = parseInt(eloText, 10);
            if (!isNaN(parsedElo)) {
                elo = parsedElo;
                foundElo = true;
            } else {
                functions.logger.warn(`Texto ELO "${eloText}" no es número válido para FIDE ID ${fideId}.`);
            }
        } else {
            functions.logger.warn(`No se encontró elemento ELO con selector "${eloSelector}" para FIDE ID ${fideId}.`);
        }
        if (!name) {
            throw new functions.https.HttpsError('not-found', `No se pudo encontrar el nombre para el FIDE ID ${fideId}.`);
        }
        if (!foundElo) {
            functions.logger.warn(`No se encontró ELO estándar válido para FIDE ID: ${fideId}. Se asignará ELO 0.`);
        }
        functions.logger.info(`Scraping exitoso para FIDE ID ${fideId}: Nombre=${name}, ELO=${elo}`);
        return { name, elo };

    } catch (error) {
        // Manejo de errores unificado para el scraping y parsing
        if (error instanceof functions.https.HttpsError) { throw error; }

        functions.logger.error(`Error procesando datos para FIDE ID ${fideId}:`, error);
        throw new functions.https.HttpsError('internal', `Error procesando datos: ${error.message}`);
    }
}

// --- Cloud Function #1: Añadir Jugador (Llamada desde admin.js) ---
// Permite añadir un jugador buscando sus datos en FIDE.
exports.addPlayerByFideId = functions.region('europe-west1').https.onCall(async (data, context) => {
    // (Aquí va tu código completo de addPlayerByFideId, incluyendo verificación de existencia,
    //  llamada a scrapeFideProfile y escritura en Firestore)
    // ... (Asegúrate que tu lógica completa está aquí) ...
    const fideId = data.fideId?.trim();
    if (!fideId) {
        throw new functions.https.HttpsError('invalid-argument', 'Se requiere proporcionar el FIDE ID.');
    }
    functions.logger.info(`Función 'addPlayerByFideId' invocada con FIDE ID: ${fideId}`);
    // Opcional: Verificar autenticación si solo admins pueden añadir
    // if (!context.auth) { throw new functions.https.HttpsError('unauthenticated', '...'); }
    try {
        const playersRef = db.collection('players');
        const existingPlayerQuery = await playersRef.where('fideId', '==', fideId).limit(1).get();
        if (!existingPlayerQuery.empty) {
            const existingPlayerData = existingPlayerQuery.docs[0].data();
            functions.logger.warn(`El jugador con FIDE ID ${fideId} ya existe: ${existingPlayerData.name}`);
            return { success: true, message: 'Este jugador ya estaba registrado.', name: existingPlayerData.name, elo: existingPlayerData.elo };
        }
        const { name, elo } = await scrapeFideProfile(fideId);
        const newPlayerData = {
            fideId: fideId,
            name: name,
            elo: elo,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await playersRef.add(newPlayerData);
        functions.logger.info(`Jugador añadido: ${docRef.id}, FIDE ID: ${fideId}, Nombre: ${name}, ELO: ${elo}`);
        return { success: true, name: name, elo: elo };
    } catch (error) {
        // (Aquí va tu manejo de errores completo para addPlayerByFideId)
        // ...
        functions.logger.error(`Error en 'addPlayerByFideId' para FIDE ID ${fideId}:`, error);
        if (error instanceof functions.https.HttpsError) {
            return { success: false, error: error.message, code: error.code };
        }
        return { success: false, error: `Error interno del servidor al procesar FIDE ID ${fideId}.` };
    }
});

// --- Cloud Function #3: Actualizar TODOS Manualmente (Llamada desde admin.js) ---
// Permite al admin forzar una actualización de todos los jugadores desde FIDE.
// ¡Importante! Esta función manual NO debe tocar el timestamp de la automática.
exports.manualUpdateAllPlayers = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 540, memory: '256MB' })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Función solo para admins autenticados.');
        }
        functions.logger.info(`Función 'manualUpdateAllPlayers' invocada por UID: ${context.auth.uid}`);
        try {
            // (Aquí va tu código completo de manualUpdateAllPlayers, incluyendo lectura de todos los players,
            //  bucle con scrapeFideProfile, actualizaciones y resumen final)
            // ... (Asegúrate que tu lógica completa está aquí) ...
            const playersSnapshot = await db.collection('players').get();
            if (playersSnapshot.empty) {
                return { success: true, message: 'No hay jugadores registrados.', checked: 0, updated: 0, errors: 0 };
            }
            let checkedCount = 0;
            let updatedCount = 0;
            let errorCount = 0;

            for (const doc of playersSnapshot.docs) {
                const player = doc.data();
                const playerId = doc.id;
                checkedCount++;
                if (!player.fideId) continue;

                try {
                    const scrapedData = await scrapeFideProfile(player.fideId);
                    if (scrapedData.elo !== player.elo || scrapedData.name !== player.name) {
                        updatedCount++;
                        await db.collection('players').doc(playerId).update({
                            elo: scrapedData.elo,
                            name: scrapedData.name,
                            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                } catch (error) {
                    errorCount++;
                    functions.logger.error(`MANUAL: Error FIDE ID ${player.fideId} (${playerId}):`, error.message || error);
                }

                // Esperar un poco entre peticiones para evitar bloqueos por rate-limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            const summaryMessage = `Actualización manual completada. Revisados: ${checkedCount}, Actualizados: ${updatedCount}, Errores: ${errorCount}.`;
            functions.logger.info(summaryMessage);
            return { success: true, message: summaryMessage, checked: checkedCount, updated: updatedCount, errors: errorCount };

        } catch (error) {
            // (Aquí va tu manejo de errores completo para manualUpdateAllPlayers)
            // ...
            functions.logger.error("Error FATAL durante 'manualUpdateAllPlayers':", error);
            if (error instanceof functions.https.HttpsError) { throw error; }
            throw new functions.https.HttpsError('internal', 'Error interno servidor en actualización masiva manual.');
        }
    });


// --- Cloud Function #2: Actualizar TODOS los ELOs (Programada - MODIFICADA CON LÓGICA MENSUAL) ---
// Se ejecuta diariamente, pero solo actualiza realmente una vez al mes.
exports.updateAllElos = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 540, memory: '256MB' })
    .pubsub.schedule('every day 05:00') // Ejecutar todos los días a las 5 AM UTC
    .timeZone('UTC') // Usar UTC simplifica
    .onRun(async (context) => {
        functions.logger.info("Iniciando ejecución DIARIA programada de 'updateAllElos'");

        // Referencia al documento que guarda cuándo se hizo la última actualización mensual
        const metadataRef = db.collection('system_metadata').doc('last_fide_update');
        let lastUpdateTimestamp = null;
        let needsUpdate = false;

        try {
            // 1. Leer la fecha de la última actualización exitosa
            const metadataDoc = await metadataRef.get();
            if (!metadataDoc.exists) {
                functions.logger.warn("Doc 'last_fide_update' no encontrado. Se actualizará.");
                needsUpdate = true;
            } else {
                lastUpdateTimestamp = metadataDoc.data()?.timestamp;
                if (!lastUpdateTimestamp || !(lastUpdateTimestamp.toDate instanceof Function)) {
                    functions.logger.warn("Timestamp inválido/ausente. Se actualizará.");
                    needsUpdate = true;
                } else {
                    // 2. Comparar mes/año guardado con mes/año actual (en UTC)
                    const lastUpdateDate = lastUpdateTimestamp.toDate();
                    const currentDate = new Date();
                    functions.logger.info(`Última act. registrada: ${lastUpdateDate.toISOString()}. Actual: ${currentDate.toISOString()}`);

                    if (lastUpdateDate.getUTCFullYear() < currentDate.getUTCFullYear() ||
                        (lastUpdateDate.getUTCFullYear() === currentDate.getUTCFullYear() &&
                            lastUpdateDate.getUTCMonth() < currentDate.getUTCMonth())) {

                        // Solo procedemos a partir del día 3 del mes para dar tiempo a que FIDE publique los nuevos ELOs
                        if (currentDate.getUTCDate() >= 3) {
                            functions.logger.info("Nuevo mes detectado (día >= 3). Se requiere actualizar.");
                            needsUpdate = true;
                        } else {
                            functions.logger.info("Nuevo mes detectado, pero es antes del día 3. Omitiendo para dar tiempo a FIDE.");
                            needsUpdate = false;
                        }
                    } else {
                        functions.logger.info("Actualización mensual ya realizada. Omitiendo.");
                        needsUpdate = false;
                    }
                }
            }

            // 3. Si NO necesita actualización, terminar aquí.
            if (!needsUpdate) {
                return null; // Termina ejecución correctamente.
            }

            // --- SI NECESITA ACTUALIZACIÓN, CONTINUAR ---
            functions.logger.info("Procediendo con la actualización masiva...");
            const playersSnapshot = await db.collection('players').get();

            if (playersSnapshot.empty) {
                functions.logger.info('Colección players vacía.');
                // Marcar como hecha la revisión de este mes aunque no hubiera jugadores
                await metadataRef.set({ timestamp: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                functions.logger.info("Timestamp 'last_fide_update' actualizado (colección vacía).");
                return null;
            }

            // (Aquí va tu código completo del bucle forEach, llamada a scrapeFideProfile,
            //  comparación, actualización en Firestore y manejo de errores por jugador)
            // ... (Asegúrate que tu lógica completa del bucle está aquí) ...
            functions.logger.info(`Revisando ${playersSnapshot.size} jugadores.`);
            let playersChecked = 0;
            let playersUpdated = 0;
            let playersErrored = 0;

            for (const doc of playersSnapshot.docs) {
                const player = doc.data();
                const playerId = doc.id;
                playersChecked++;
                if (!player.fideId) {
                    functions.logger.warn(`Jugador ${playerId} (${player.name || 'SN'}) sin FIDE ID. Omitiendo.`);
                    continue;
                }

                try {
                    const scrapedData = await scrapeFideProfile(player.fideId);
                    if (scrapedData.elo !== player.elo || scrapedData.name !== player.name) {
                        functions.logger.info(`ACTUALIZANDO ${player.name} -> ${scrapedData.name} (FIDE ${player.fideId}). ELO: ${player.elo} -> ${scrapedData.elo}`);
                        playersUpdated++;
                        await db.collection('players').doc(playerId).update({
                            elo: scrapedData.elo,
                            name: scrapedData.name,
                            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                        });
                    } else {
                        functions.logger.info(`Datos sin cambios para ${player.name} (${player.fideId}).`);
                    }
                } catch (error) {
                    playersErrored++;
                    functions.logger.error(`Error actualizando FIDE ID ${player.fideId} (${playerId}):`, error.message || error);
                }

                // Esperar un poco entre peticiones
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            functions.logger.info(`Actualización mensual completada. Rev: ${playersChecked}, Act: ${playersUpdated}, Err: ${playersErrored}`);

            // 4. Actualizar el timestamp para marcar que ya se hizo este mes.
            await metadataRef.set({ timestamp: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            functions.logger.info("Timestamp 'last_fide_update' actualizado.");

            return null;

        } catch (error) {
            functions.logger.error("Error FATAL en ejecución programada 'updateAllElos':", error);
            // No actualizamos timestamp si falla para reintentar mañana
            return null;
        }
    });

// --- FIN COMPLETO de functions/index.js ---