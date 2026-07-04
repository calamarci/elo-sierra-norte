// --- Inicio de js/database.js (Versión COMPAT) ---

// Obtener la instancia de Firestore del objeto global firebase
// Asegúrate de que firebase-firestore-compat.js está incluido en el HTML
const db = firebase.firestore();
console.log("Instancia de Firestore DB (compat) obtenida.");

// Constante para el nombre de la colección
const PLAYERS_COLLECTION = 'players';

// --- Funciones que interactúan con Firestore ---

// Función para obtener todos los jugadores (ya no se usa directamente en admin/app con listener)
// Podría ser útil para otras cosas o si quitas el listener
function getAllPlayers() {
    console.log("Llamando a getAllPlayers (compat)...");
    return db.collection(PLAYERS_COLLECTION)
        .orderBy('elo', 'desc')
        .get()
        .then((querySnapshot) => {
            const players = [];
            querySnapshot.forEach((doc) => {
                players.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            console.log(`getAllPlayers encontró ${players.length} jugadores.`);
            return players;
        })
        .catch(error => {
             console.error("Error en getAllPlayers:", error);
             throw error; // Relanzar para que el llamador lo maneje
        });
}

// Función para añadir un nuevo jugador (placeholder ELO=0; el workflow de GitHub
// Actions rellenará el ELO real en ~30s al sincronizar con FIDE).
async function addPlayerByFideIdPlaceholder(fideId) {
    console.log(`Añadiendo jugador placeholder FIDE ID: ${fideId}`);
    return db.collection(PLAYERS_COLLECTION).add({
        fideId: String(fideId),
        name: `(Pendiente) ${fideId}`,
        elo: 0,
        lastUpdated: new Date(),
    });
}

// Función para buscar si ya existe un jugador con un FIDE ID dado.
// Devuelve true si ya existe, false en caso contrario.
async function playerExistsByFideId(fideId) {
    console.log(`Comprobando existencia de FIDE ID: ${fideId}`);
    const snapshot = await db.collection(PLAYERS_COLLECTION)
        .where('fideId', '==', String(fideId))
        .limit(1)
        .get();
    return !snapshot.empty;
}

// Función para añadir un nuevo jugador (ya no la usa directamente admin.js)
function addPlayer(name, elo) {
    console.warn("Llamada a addPlayer (compat) - ¡Esta función ya no debería usarse directamente desde el frontend!");
    return db.collection(PLAYERS_COLLECTION).add({
        name: name,
        elo: Number(elo),
        lastUpdated: new Date()
    });
}

// Función para actualizar el ELO de un jugador (usada por el update manual en admin.js)
function updatePlayerElo(playerId, newElo) {
    console.log(`Llamando a updatePlayerElo (compat) para ID: ${playerId}, Nuevo ELO: ${newElo}`);
    return db.collection(PLAYERS_COLLECTION).doc(playerId).update({
        elo: Number(newElo),
        // Usar FieldValue.serverTimestamp() sigue siendo ideal aquí si es posible
        // En v9 compat, se importa así: import { serverTimestamp } from "firebase/firestore/compat";
        // Pero como estamos evitando imports, intentemos accederlo globalmente
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp() // Intentar acceso global
        // Si lo anterior falla, una alternativa menos ideal es new Date()
        // lastUpdated: new Date()
    })
    .catch(error => {
         console.error(`Error en updatePlayerElo para ${playerId}:`, error);
         throw error;
    });
}

// Función para eliminar un jugador (usada por admin.js)
function deletePlayer(playerId) {
    console.log(`Llamando a deletePlayer (compat) para ID: ${playerId}`);
    return db.collection(PLAYERS_COLLECTION).doc(playerId).delete()
        .catch(error => {
             console.error(`Error en deletePlayer para ${playerId}:`, error);
             throw error;
        });
}

// Función para buscar jugadores por nombre (usada por app.js)
// Nota: Esta versión busca en el cliente después de traer *todos* los jugadores.
// Para bases de datos grandes, sería mejor hacer la query en Firestore.
function searchPlayersByName(name) {
    console.log(`Llamando a searchPlayersByName (compat) con término: ${name}`);
    const searchNameLower = name.toLowerCase();
    // Primero obtiene todos los jugadores
    return getAllPlayers().then(players => {
        // Luego filtra en el cliente
        const filteredPlayers = players.filter(player =>
            player.name && player.name.toLowerCase().includes(searchNameLower)
        );
        console.log(`searchPlayersByName encontró ${filteredPlayers.length} coincidencias.`);
        return filteredPlayers;
    })
    .catch(error => {
         console.error(`Error en searchPlayersByName para "${name}":`, error);
         throw error;
    });
}

// Función para escuchar cambios en tiempo real (usada por admin.js y app.js)
// ¡ESTA ES LA QUE DABA EL ERROR!
function listenForPlayerUpdates(callback) {
    console.log("Estableciendo listener de Firestore en tiempo real (compat)...");
    // Asegurarse de usar la 'db' definida al principio de este archivo
    const unsubscribe = db.collection(PLAYERS_COLLECTION)
        .orderBy('elo', 'desc')
        .onSnapshot((querySnapshot) => {
            console.log("Listener onSnapshot (compat) recibió datos.");
            const players = [];
            querySnapshot.forEach((doc) => {
                players.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            console.log(`Listener onSnapshot (compat) procesó ${players.length} jugadores.`);
            // Llama a la función que le pasaron (ej: renderAdminPlayersList) con los datos actualizados
            callback(players);
        }, (error) => {
            // Manejo de errores del listener
            console.error("Error en el listener de Firestore (onSnapshot):", error);
            // Aquí podrías querer notificar al usuario o intentar reconectar.
            alert("Error al obtener actualizaciones de jugadores en tiempo real. Intenta recargar la página.");
        });

    // Devuelve la función que permite cancelar la escucha
    console.log("Listener de Firestore (compat) establecido. Devolviendo función de desuscripción.");
    return unsubscribe;
}

// --- Fin de js/database.js (Versión COMPAT) ---