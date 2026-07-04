// --- INICIO COMPLETO de functions/index.js ---

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// Inicialización (asegurar que solo se haga una vez)
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

// --- Cloud Function: triggerEloSync ---
// Dispara el workflow de GitHub Actions que sincroniza ELOs desde FIDE.
// El scraping/descarga ZIP corre en GitHub Actions (IPs de GitHub no bloqueadas por FIDE),
// gratis para siempre, sin proxies ni APIs de pago.
//
// Recibe (vía data):
//   mode:       "auto" (defecto) | "scrape" | "zip"
//   targetIds:  "id1,id2,..." (vacío = todos los jugadores de Firestore)
//   force:      boolean (ignorar lógica mensual)
//
// Requiere los secrets GH_PAT (GitHub fine-grained PAT) y GH_REPO ("owner/name").
exports.triggerEloSync = functions
    .region('europe-west1')
    .runWith({
        timeoutSeconds: 30,
        memory: '128MB',
        secrets: ['GH_PAT', 'GH_REPO']
    })
    .https.onCall(async (data, context) => {
        // Solo admin autenticado
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Acción solo para administradores.');
        }
        const ghPat = process.env.GH_PAT;
        const ghRepo = (process.env.GH_REPO || '').trim();
        if (!ghPat || !ghRepo) {
            throw new functions.https.HttpsError('failed-precondition',
                'No se ha configurado GH_PAT / GH_REPO. Ejecuta: ' +
                'firebase functions:secrets:set GH_PAT  y  firebase functions:secrets:set GH_REPO');
        }

        const mode = data?.mode || 'auto';
        const targetIds = data?.targetIds || '';
        const force = !!data?.force;

        // Disparar el workflow vía API GitHub workflow_dispatch
        const url = `https://api.github.com/repos/${ghRepo}/actions/workflows/monthly-elo-sync.yml/dispatches`;
        try {
            const resp = await axios.post(url, {
                ref: 'main',
                inputs: {
                    mode: mode,
                    target_ids: targetIds,
                    force: String(force),
                },
            }, {
                headers: {
                    'Authorization': `Bearer ${ghPat}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'elo-sierra-norte-cf',
                },
                timeout: 15000,
                validateStatus: s => s < 500,
            });

            if (resp.status === 204) {
                functions.logger.info(`Workflow disparado: mode=${mode} targetIds='${targetIds}' force=${force}`);
                return {
                    success: true,
                    message: 'Sincronización iniciada. Los ELOs se actualizarán en ~30-60s.',
                    mode, targetIds, force,
                };
            }
            if (resp.status === 404) {
                throw new functions.https.HttpsError('not-found',
                    `Repo o workflow no encontrado en GitHub: ${ghRepo}. ¿Está creado y el workflow commiteado en .github/workflows/?`);
            }
            if (resp.status === 401 || resp.status === 403) {
                throw new functions.https.HttpsError('permission-denied',
                    `GitHub PAT sin permisos sobre ${ghRepo}. Crea un fine-grained PAT con Actions:Write sobre el repo.`);
            }
            throw new functions.https.HttpsError('internal',
                `GitHub respondió status ${resp.status}: ${JSON.stringify(resp.data).substring(0, 200)}`);
        } catch (error) {
            functions.logger.error('Error disparando workflow GitHub:', error.message);
            if (error instanceof functions.https.HttpsError) throw error;
            throw new functions.https.HttpsError('internal', `No se pudo contactar con GitHub: ${error.message}`);
        }
    });

// --- FIN COMPLETO de functions/index.js ---