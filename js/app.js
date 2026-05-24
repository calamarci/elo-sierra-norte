// --- Inicio js/app.js ---

// Referencias a elementos DOM
const playersListElement = document.getElementById('players-list');
const searchPlayerInput = document.getElementById('search-player');
// const adminLink = document.getElementById('admin-link'); // Eliminado del HTML
const currentYearElement = document.getElementById('current-year');

// Variables globales
let unsubscribe = null; // Listener de Firestore

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', function() {
    console.log("App DOM Cargado.");
    // Establecer el año actual en el footer
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    } else {
        console.warn("Elemento 'current-year' no encontrado en index.html");
    }

    // Cargar jugadores y establecer escucha en tiempo real
    setupPlayersListener();

    // Configurar la búsqueda de jugadores
    setupSearch();

    // Verificar estado de autenticación (puede ser útil para futuras features)
    // Ya no actualiza el enlace de admin porque no existe
    checkAuthState(user => {
        console.log("Estado Auth (App):", user ? user.email : 'No logueado');
        // Aquí podrías añadir lógica futura si quieres mostrar algo distinto
        // a usuarios logueados vs anónimos en la página pública.
    });
});

// Función para configurar la escucha en tiempo real de jugadores
function setupPlayersListener() {
    // Cancelar listener anterior si existe
    if (unsubscribe) {
        unsubscribe();
    }
    // Iniciar nuevo listener (la función viene de database.js)
    console.log("Estableciendo listener para jugadores (App)...");
    unsubscribe = listenForPlayerUpdates(renderPlayersList); // Llama a la función de renderizado modificada
}

// Función para renderizar la lista de jugadores (MODIFICADA)
function renderPlayersList(players) {
    console.log("Renderizando lista pública. Jugadores:", players ? players.length : 0);
    if (!playersListElement) {
        console.error("Elemento 'players-list' no encontrado.");
        return;
    }
    playersListElement.innerHTML = ''; // Limpiar tabla

    if (!players || players.length === 0) {
        // Ajustar colspan a 3 columnas (Posición, Nombre, ELO)
        playersListElement.innerHTML = '<tr><td colspan="3">No se encontraron jugadores.</td></tr>';
        return;
    }

    // Ya vienen ordenados por ELO desde database.js (listenForPlayerUpdates)

    players.forEach((player, index) => {
        const row = document.createElement('tr');
        const fideId = player.fideId; // Obtener el FIDE ID

        // Construir celdas básicas
        const positionCell = `<td>${index + 1}</td>`;
        const nameCell = `<td>${player.name || '(Sin nombre)'}</td>`;
        const eloCell = `<td>${(player.elo !== undefined && player.elo !== null) ? player.elo : 'N/A'}</td>`;
        // Celda de 'Última Actualización' ELIMINADA

        // Rellenar la fila
        row.innerHTML = positionCell + nameCell + eloCell;

        // --- Lógica para hacer la fila clicable ---
        if (fideId) {
            // Si tiene FIDE ID, hacerla clicable
            row.classList.add('clickable-row'); // Añadir clase para CSS (cursor, hover)
            row.style.cursor = 'pointer'; // Asegurar cursor pointer
            row.title = `Ver perfil FIDE de ${player.name || 'jugador'}`; // Tooltip

            // Añadir el listener de clic
            row.addEventListener('click', () => {
                const fideProfileUrl = `https://ratings.fide.com/profile/${fideId}`;
                window.open(fideProfileUrl, '_blank'); // Abrir en nueva pestaña
            });
        } else {
            // Si no tiene FIDE ID, no hacer nada especial
            row.title = "Este jugador no tiene un ID FIDE asociado";
        }
        // --- Fin lógica clicable ---

        playersListElement.appendChild(row);
    });
}

// Función para configurar la búsqueda (sin cambios funcionales)
function setupSearch() {
    searchPlayerInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.trim().toLowerCase();

        // Detener el listener en tiempo real mientras se busca
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null; // Marcar como detenido
            console.log("Listener detenido para búsqueda.");
        }

        if (searchTerm === '') {
            // Si la búsqueda está vacía, volver a activar el listener
            console.log("Búsqueda vacía, reactivando listener...");
            setupPlayersListener();
        } else {
            // Si hay un término de búsqueda, buscar en Firestore (o local si prefieres)
            // Usamos la función de database.js que busca por nombre (case-insensitive)
            // Nota: searchPlayersByName actualmente trae TODO y filtra en cliente.
            // Para BBDD grandes, sería mejor query directa a Firestore.
            searchPlayersByName(searchTerm) // Función de database.js
                .then(filteredPlayers => {
                    console.log(`Búsqueda por "${searchTerm}" encontró ${filteredPlayers.length} jugadores.`);
                    renderPlayersList(filteredPlayers); // Renderizar solo los filtrados
                })
                .catch(error => {
                    console.error('Error al buscar jugadores:', error);
                    playersListElement.innerHTML = '<tr><td colspan="3">Error al realizar la búsqueda.</td></tr>';
                });
        }
    });
}

// Función para actualizar la UI basada en Auth (ya no necesaria para link admin)
// function updateUIForAuthState(user) { ... } // Se puede eliminar o dejar vacía

console.log("app.js cargado.");
// --- Fin js/app.js ---