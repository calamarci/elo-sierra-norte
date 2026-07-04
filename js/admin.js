// --- Inicio de js/admin.js ---

// Referencias a elementos DOM
const authSection = document.getElementById('auth-section');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const playerFideIdInput = document.getElementById('player-fide-id');
const addPlayerBtn = document.getElementById('add-player-btn');
const adminPlayersList = document.getElementById('admin-players-list'); // tbody
const currentYearElement = document.getElementById('current-year');
const updateAllBtn = document.getElementById('update-all-btn');
const updateAllStatusElement = document.getElementById('update-all-status'); // Span para estado

// Variables globales
let unsubscribeFirestoreListener = null; // Listener de Firestore

// Inicialización al cargar el DOM
document.addEventListener('DOMContentLoaded', function () {
    console.log("Admin DOM Cargado. Iniciando config.");
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    }
    checkAuthState(updateUIForAuthState);
    setupEventListeners();
});

// Configura TODOS los listeners de eventos una sola vez
function setupEventListeners() {
    console.log("Configurando event listeners...");
    if (loginForm) loginForm.addEventListener('submit', (e) => e.preventDefault());
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (addPlayerBtn) addPlayerBtn.addEventListener('click', handleAddPlayer);
    if (updateAllBtn) updateAllBtn.addEventListener('click', handleManualUpdateAll);
    console.log("Event listeners configurados.");
}

// --- Funciones de Autenticación ---
function handleLogin() {
    console.log("Intentando iniciar sesión...");
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
        alert('Por favor, ingresa correo electrónico y contraseña.');
        return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = 'Iniciando sesión...';
    loginUser(email, password)
        .catch(error => {
            console.error('Error detallado al iniciar sesión:', error);
            alert(`Error al iniciar sesión: ${mapAuthError(error.code)}`);
            loginBtn.disabled = false;
            loginBtn.textContent = 'Iniciar Sesión';
        });
}

function handleLogout() {
    console.log("Cerrando sesión...");
    logoutUser()
        .catch(error => {
            console.error('Error al cerrar sesión:', error);
            alert(`Error al cerrar sesión: ${error.message}`);
        });
}

function mapAuthError(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-email': return 'El formato del correo electrónico no es válido.';
        case 'auth/user-not-found': return 'No se encontró usuario con ese correo.';
        case 'auth/wrong-password': return 'La contraseña es incorrecta.';
        case 'auth/invalid-credential': return 'Credenciales inválidas.';
        default: return `Error desconocido (${errorCode})`;
    }
}

// --- Lógica de Administración de Jugadores ---

// Añadir Jugador por FIDE ID
// Crea un documento placeholder en Firestore con ELO=0.
// La sincronización automática (desde el PC del admin) rellenará el ELO real
// la próxima vez que se ejecute el script mensual.
async function handleAddPlayer() {
    console.log("Botón 'Añadir/Buscar Jugador' presionado.");
    const fideId = playerFideIdInput.value.trim();
    if (!fideId) {
        alert('Por favor, ingresa el ID FIDE numérico del jugador.');
        return;
    }

    addPlayerBtn.disabled = true;
    addPlayerBtn.textContent = 'Añadiendo...';

    try {
        const exists = await playerExistsByFideId(fideId);
        if (exists) {
            alert('Este jugador ya está registrado.');
            return;
        }
        await addPlayerByFideIdPlaceholder(fideId);
        console.log(`Placeholder creado para FIDE ID ${fideId}.`);
        alert(`Jugador añadido. Su ELO se actualizará automáticamente en la próxima sincronización mensual (día 1-12 del mes).`);
        playerFideIdInput.value = '';
    } catch (error) {
        console.error('Error añadiendo jugador:', error);
        alert(`Error: ${error.message}`);
    } finally {
        addPlayerBtn.disabled = false;
        addPlayerBtn.textContent = 'Añadir Jugador';
    }
}

// Eliminar Jugador llamando a función de database.js
function handleDeletePlayer(playerId, playerName) {
    const nameForConfirm = playerName || 'este jugador';
    console.log(`Solicitando confirmación para eliminar ID: ${playerId}, Nombre: ${nameForConfirm}`);

    if (confirm(`¿Estás SEGURO de que quieres eliminar a ${nameForConfirm}? Esta acción no se puede deshacer.`)) {
        console.log(`Confirmado. Eliminando jugador ${playerId}...`);
        deletePlayer(playerId)
            .then(() => {
                console.log(`Jugador ${playerId} eliminado.`);
                alert('Jugador eliminado con éxito.');
            })
            .catch(error => {
                console.error(`Error al eliminar jugador ${playerId}:`, error);
                alert(`Error al eliminar jugador: ${error.message}`);
            });
    } else {
        console.log(`Eliminación cancelada para ${playerId}.`);
    }
}

// Renderiza la tabla de jugadores en el panel de administración
function renderAdminPlayersList(players) {
    console.log("Renderizando lista admin. Jugadores:", players ? players.length : 0);
    if (!adminPlayersList) {
        console.error("Elemento 'admin-players-list' (tbody) no encontrado.");
        return;
    }
    adminPlayersList.innerHTML = '';

    if (!players || players.length === 0) {
        adminPlayersList.innerHTML = '<tr><td colspan="4">No hay jugadores registrados.</td></tr>';
        return;
    }

    const sortedPlayers = [...players].sort((a, b) => (b.elo || 0) - (a.elo || 0));

    sortedPlayers.forEach(player => {
        const row = document.createElement('tr');
        row.dataset.playerId = player.id;

        const displayName = player.name || '(Sin nombre)';
        const safeDisplayName = displayName.replace(/'/g, "\\'");
        const displayElo = (player.elo !== undefined && player.elo !== null) ? player.elo : 'N/A';
        const fideId = player.fideId;

        let fideIdCellContent;
        if (fideId) {
            const fideProfileUrl = `https://ratings.fide.com/profile/${fideId}`;
            fideIdCellContent = `<a href="${fideProfileUrl}" target="_blank" rel="noopener noreferrer" title="Ver perfil FIDE de ${displayName}">${fideId}</a>`;
        } else {
            fideIdCellContent = 'No asignado';
        }

        row.innerHTML = `
            <td>${displayName}</td>
            <td>${displayElo}</td>
            <td>${fideIdCellContent}</td>
            <td class="action-btns">
                <button
                    class="delete-btn btn"
                    onclick="handleDeletePlayer('${player.id}', '${safeDisplayName}')"
                    title="Eliminar este jugador">
                    Eliminar
                </button>
            </td>
        `;
        adminPlayersList.appendChild(row);
    });
}

// Maneja el clic en "Actualizar Todos (FIDE)"
// Ahora informativo: la sincronización se hace automáticamente desde el PC del admin
// (Programador de Tareas de Windows). Aquí solo se informa.
function handleManualUpdateAll() {
    console.log("Botón 'Actualizar Todos (FIDE)' presionado.");
    if (!confirm("La sincronización de ELOs se realiza automáticamente desde el PC del administrador (día 1-12 de cada mes).\n\n¿Quieres forzarla AHORA? Debes ejecutar en tu PC:\n\n  D:\\Visual Studio Projects\\ELO Sierra Norte\\scripts\\run-sync.bat --force\n\n(El panel web no puede forzarla directamente.)")) {
        return;
    }
    if (updateAllStatusElement) {
        updateAllStatusElement.textContent = 'Para forzar: ejecuta scripts\\run-sync.bat --force en tu PC.';
        updateAllStatusElement.className = 'status-processing';
        updateAllStatusElement.style.display = 'inline-block';
        setTimeout(() => { if (updateAllStatusElement) updateAllStatusElement.style.display = 'none'; }, 8000);
    }
    alert('Para forzar la sincronización ahora, ejecuta en tu PC:\n\n  D:\\Visual Studio Projects\\ELO Sierra Norte\\scripts\\run-sync.bat --force\n\nLos ELOs se actualizarán en ~30 segundos.');
}

// Actualiza la interfaz de usuario según el estado de autenticación
function updateUIForAuthState(user) {
    console.log("Actualizando UI por Auth State. User:", user ? user.email : 'null');
    if (user) {
        if (authSection) authSection.style.display = 'none';
        if (adminPanel) adminPanel.style.display = 'block';
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';

        // Configurar listener de Firestore para la tabla de jugadores
        if (unsubscribeFirestoreListener) {
            console.log("Cancelando listener Firestore anterior.");
            unsubscribeFirestoreListener();
        }
        console.log("Estableciendo NUEVO listener Firestore...");
        unsubscribeFirestoreListener = listenForPlayerUpdates(renderAdminPlayersList);

        if (updateAllStatusElement) {
            updateAllStatusElement.style.display = 'none';
            updateAllStatusElement.textContent = '';
        }

    } else {
        if (authSection) authSection.style.display = 'block';
        if (adminPanel) adminPanel.style.display = 'none';

        if (unsubscribeFirestoreListener) {
            console.log("Usuario no autenticado. Cancelando listener Firestore.");
            unsubscribeFirestoreListener();
            unsubscribeFirestoreListener = null;
        }
        if (adminPlayersList) adminPlayersList.innerHTML = '';
        if (playerFideIdInput) playerFideIdInput.value = '';

        if (updateAllStatusElement) {
            updateAllStatusElement.textContent = '';
            updateAllStatusElement.style.display = 'none';
            updateAllStatusElement.className = '';
        }
    }
}

// --- Exponer funciones necesarias al scope global ---
window.handleDeletePlayer = handleDeletePlayer;

console.log("admin.js cargado y configurado.");
// --- Fin de js/admin.js ---