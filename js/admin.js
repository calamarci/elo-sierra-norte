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
let triggerEloSyncFunction = null; // Referencia a Cloud Function

// Inicialización al cargar el DOM
document.addEventListener('DOMContentLoaded', function () {
    console.log("Admin DOM Cargado. Iniciando config.");
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    }
    // Verifica estado de auth al cargar y establece la UI inicial
    checkAuthState(updateUIForAuthState);
    // Configura listeners de botones (se activarán/desactivarán en updateUI)
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

// Inicializa las referencias a las Cloud Functions (llamada solo cuando está logueado)
function initializeFirebaseFunctions() {
    if (triggerEloSyncFunction) {
        console.log("Ref a Cloud Function ya inicializada.");
        return;
    }
    console.log("Inicializando referencias a Cloud Functions...");
    try {
        if (firebase && typeof firebase.functions === 'function') {
            const functions = firebase.app().functions('europe-west1');
            triggerEloSyncFunction = functions.httpsCallable('triggerEloSync', { timeout: 30000 });
            console.log("Ref a 'triggerEloSync' OK.");
            if (addPlayerBtn) addPlayerBtn.disabled = false;
            if (updateAllBtn) updateAllBtn.disabled = false;
        } else {
            throw new Error("SDK de Firebase Functions no está cargado o inicializado.");
        }
    } catch (error) {
        console.error("Error CRÍTICO al inicializar Firebase Functions:", error);
        alert("Error de Configuración: No se pudo conectar con las funciones del servidor. Algunas acciones estarán deshabilitadas.");
        if (addPlayerBtn) addPlayerBtn.disabled = true;
        if (updateAllBtn) updateAllBtn.disabled = true;
    }
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
    // Llama a loginUser de auth.js
    loginUser(email, password)
        .catch(error => {
            // Manejo de errores de login
            console.error('Error detallado al iniciar sesión:', error);
            alert(`Error al iniciar sesión: ${mapAuthError(error.code)}`);
            // Solo re-habilitar botón en caso de error
            loginBtn.disabled = false;
            loginBtn.textContent = 'Iniciar Sesión';
        });
    // En caso de éxito, updateUIForAuthState se encargará de la UI
}

function handleLogout() {
    console.log("Cerrando sesión...");
    // Llama a logoutUser de auth.js
    logoutUser()
        .catch(error => {
            console.error('Error al cerrar sesión:', error);
            alert(`Error al cerrar sesión: ${error.message}`);
        });
    // updateUIForAuthState limpiará la UI
}

// Mapea códigos de error de Firebase Auth a mensajes amigables
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

// Añadir/Buscar Jugador por FIDE ID
// Crea un doc placeholder y dispara el workflow de GitHub que rellenará el ELO real.
async function handleAddPlayer() {
    console.log("Botón 'Añadir/Buscar Jugador' presionado.");
    const fideId = playerFideIdInput.value.trim();
    if (!fideId) {
        alert('Por favor, ingresa el ID FIDE numérico del jugador.');
        return;
    }
    if (!triggerEloSyncFunction) {
        alert("Error: la función no está lista. Recarga la página.");
        return;
    }

    addPlayerBtn.disabled = true;
    addPlayerBtn.textContent = 'Añadiendo...';

    try {
        // 1. ¿Ya existe?
        const exists = await playerExistsByFideId(fideId);
        if (exists) {
            alert('Este jugador ya está registrado.');
            return;
        }
        // 2. Crea placeholder en Firestore
        await addPlayerByFideIdPlaceholder(fideId);
        console.log(`Placeholder creado para FIDE ID ${fideId}.`);
        // 3. Dispara el workflow para ese ID (scraping directo en GitHub)
        const r = await triggerEloSyncFunction({ mode: 'scrape', targetIds: String(fideId) });
        console.log('Respuesta triggerEloSync:', r.data);
        if (r.data && r.data.success) {
            alert(`Jugador añadido. Su ELO aparecerá automaticamente en ~30s.`);
            playerFideIdInput.value = '';
        } else {
            alert(`Jugador creado pero el workflow no se disparó: ${r.data?.message || 'desconocido'}`);
        }
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
        // Llama a la función 'deletePlayer' definida en database.js
        deletePlayer(playerId)
            .then(() => {
                console.log(`Jugador ${playerId} eliminado.`);
                alert('Jugador eliminado con éxito.');
                // La tabla se refrescará automáticamente por el listener.
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
    adminPlayersList.innerHTML = ''; // Limpiar tabla

    if (!players || players.length === 0) {
        adminPlayersList.innerHTML = '<tr><td colspan="4">No hay jugadores registrados.</td></tr>';
        return;
    }

    // Ordenar por ELO (Firestore ya debería hacerlo, pero doble check)
    const sortedPlayers = [...players].sort((a, b) => (b.elo || 0) - (a.elo || 0));

    sortedPlayers.forEach(player => {
        const row = document.createElement('tr');
        row.dataset.playerId = player.id; // Guardar ID por si acaso

        const displayName = player.name || '(Sin nombre)';
        // Escapar comillas en nombre para que no rompa el string del onclick
        const safeDisplayName = displayName.replace(/'/g, "\\'");
        const displayElo = (player.elo !== undefined && player.elo !== null) ? player.elo : 'N/A';
        const fideId = player.fideId; // Obtener el FIDE ID

        // Crear contenido para la celda FIDE ID (enlace o texto)
        let fideIdCellContent;
        if (fideId) {
            const fideProfileUrl = `https://ratings.fide.com/profile/${fideId}`;
            fideIdCellContent = `<a href="${fideProfileUrl}" target="_blank" rel="noopener noreferrer" title="Ver perfil FIDE de ${displayName}">${fideId}</a>`;
        } else {
            fideIdCellContent = 'No asignado';
        }

        // Construir la fila HTML
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

// Maneja el clic en "Actualizar Todos (FIDE)" dispara el workflow de GitHub
async function handleManualUpdateAll() {
    console.log("Botón 'Actualizar Todos (FIDE)' presionado.");
    if (!triggerEloSyncFunction) {
        alert("Error: la función no está lista. Recarga la página.");
        return;
    }
    if (!confirm("¿Iniciar sincronización con FIDE? Los ELOs se actualizarán en ~30-60s.")) {
        return;
    }

    if (updateAllBtn) {
        updateAllBtn.disabled = true;
        updateAllBtn.textContent = 'Disparando workflow...';
    }
    if (updateAllStatusElement) {
        updateAllStatusElement.textContent = 'Sincronización en curso... ⏳';
        updateAllStatusElement.className = 'status-processing';
        updateAllStatusElement.style.display = 'inline-block';
    }

    try {
        const r = await triggerEloSyncFunction({ mode: 'auto' });
        if (r.data && r.data.success) {
            if (updateAllStatusElement) {
                updateAllStatusElement.textContent = `Sincronización iniciada. Refrescando en ~1 min... 👍`;
                updateAllStatusElement.className = 'status-success';
            }
            alert('Sincronización iniciada. Los ELOs aparecerán automaticamente en ~30-60s.');
        } else {
            if (updateAllStatusElement) {
                updateAllStatusElement.textContent = `Error: ${r.data?.message || ''} ❌`;
                updateAllStatusElement.className = 'status-error';
            }
            alert(`Error: ${r.data?.message || 'desconocido'}`);
        }
    } catch (error) {
        console.error('Error disparando workflow:', error);
        if (updateAllStatusElement) {
            updateAllStatusElement.textContent = `Error: ${error.message} 🔌`;
            updateAllStatusElement.className = 'status-error';
        }
        alert(`Error: ${error.message}`);
    } finally {
        if (updateAllBtn) {
            updateAllBtn.disabled = false;
            updateAllBtn.textContent = 'Actualizar Todos (FIDE)';
        }
        setTimeout(() => {
            if (updateAllStatusElement) {
                updateAllStatusElement.style.display = 'none';
            }
        }, 8000);
    }
}

// Actualiza la interfaz de usuario según el estado de autenticación
function updateUIForAuthState(user) {
    console.log("Actualizando UI por Auth State. User:", user ? user.email : 'null');
    if (user) {
        // --- Usuario AUTENTICADO ---
        if (authSection) authSection.style.display = 'none';
        if (adminPanel) adminPanel.style.display = 'block';
        // Limpiar campos de login residuales
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';

        // Inicializar referencias a Cloud Functions AHORA que está logueado
        initializeFirebaseFunctions();

        // Configurar listener de Firestore para la tabla de jugadores
        if (unsubscribeFirestoreListener) {
            console.log("Cancelando listener Firestore anterior.");
            unsubscribeFirestoreListener();
        }
        console.log("Estableciendo NUEVO listener Firestore...");
        // La función listenForPlayerUpdates debe venir de database.js
        unsubscribeFirestoreListener = listenForPlayerUpdates(renderAdminPlayersList);

        // Ocultar/limpiar estado de actualización al cargar panel
        if (updateAllStatusElement) {
            updateAllStatusElement.style.display = 'none';
            updateAllStatusElement.textContent = '';
        }

    } else {
        // --- Usuario NO AUTENTICADO ---
        if (authSection) authSection.style.display = 'block';
        if (adminPanel) adminPanel.style.display = 'none';

        // Cancelar listener de Firestore si existe
        if (unsubscribeFirestoreListener) {
            console.log("Usuario no autenticado. Cancelando listener Firestore.");
            unsubscribeFirestoreListener();
            unsubscribeFirestoreListener = null;
        }
        // Limpiar tabla y campos del panel admin
        if (adminPlayersList) adminPlayersList.innerHTML = '';
        if (playerFideIdInput) playerFideIdInput.value = '';

        // Limpiar estado de actualización
        if (updateAllStatusElement) {
            updateAllStatusElement.textContent = '';
            updateAllStatusElement.style.display = 'none';
            updateAllStatusElement.className = ''; // Quitar clases de estado
        }

        // Deshabilitar botones que dependen de funciones/login
        if (addPlayerBtn) addPlayerBtn.disabled = true;
        if (updateAllBtn) updateAllBtn.disabled = true;

        // Resetear referencias a Cloud Functions
        triggerEloSyncFunction = null;
        console.log("Referencias Cloud Functions reseteadas (logout).");
    }
}

// --- Exponer funciones necesarias al scope global ---
// Necesario para que el `onclick="handleDeletePlayer(...)"` funcione
window.handleDeletePlayer = handleDeletePlayer;

console.log("admin.js cargado y configurado.");
// --- Fin de js/admin.js ---