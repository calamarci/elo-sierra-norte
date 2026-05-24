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
let addPlayerByFideIdFunction = null; // Referencia a Cloud Function
let manualUpdateAllPlayersFunction = null; // Referencia a Cloud Function

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
    // Evitar re-inicialización innecesaria
    if (addPlayerByFideIdFunction && manualUpdateAllPlayersFunction) {
        console.log("Refs a Cloud Functions ya inicializadas.");
        return;
    }
    console.log("Inicializando referencias a Cloud Functions...");
    try {
        if (firebase && typeof firebase.functions === 'function') {
            // Asegúrate que la región coincide con la de tus funciones
            const functions = firebase.app().functions('europe-west1');

            // Obtener referencias si no existen ya
            if (!addPlayerByFideIdFunction) {
                addPlayerByFideIdFunction = functions.httpsCallable('addPlayerByFideId');
                console.log("Ref a 'addPlayerByFideId' OK.");
            }
            if (!manualUpdateAllPlayersFunction) {
                manualUpdateAllPlayersFunction = functions.httpsCallable('manualUpdateAllPlayers', { timeout: 540000 });
                console.log("Ref a 'manualUpdateAllPlayers' OK.");
            }

            // Habilitar botones correspondientes si las referencias son válidas
            if (addPlayerBtn && addPlayerByFideIdFunction) addPlayerBtn.disabled = false;
            if (updateAllBtn && manualUpdateAllPlayersFunction) updateAllBtn.disabled = false;

        } else {
            throw new Error("SDK de Firebase Functions no está cargado o inicializado.");
        }
    } catch (error) {
        console.error("Error CRÍTICO al inicializar Firebase Functions:", error);
        alert("Error de Configuración: No se pudo conectar con las funciones del servidor. Algunas acciones estarán deshabilitadas.");
        // Deshabilitar botones si falla la inicialización
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

// Añadir/Buscar Jugador por FIDE ID llamando a Cloud Function
function handleAddPlayer() {
    console.log("Botón 'Añadir/Buscar Jugador' presionado.");
    const fideId = playerFideIdInput.value.trim();
    if (!fideId) {
        alert('Por favor, ingresa el ID FIDE numérico del jugador.');
        return;
    }
    // Verificar que la referencia a la función esté lista
    if (!addPlayerByFideIdFunction) {
        alert("Error: La función para añadir jugadores no está lista. Intenta recargar.");
        console.error("handleAddPlayer: addPlayerByFideIdFunction es null.");
        return;
    }

    console.log(`Llamando a Cloud Function 'addPlayerByFideId' con FIDE ID: ${fideId}`);
    addPlayerBtn.disabled = true;
    addPlayerBtn.textContent = 'Procesando...';

    // Llamar a la Cloud Function
    addPlayerByFideIdFunction({ fideId: fideId })
        .then(result => {
            console.log("Respuesta de 'addPlayerByFideId':", result.data);
            if (result.data.success) {
                alert(`Éxito: ${result.data.name} (ELO: ${result.data.elo}). ${result.data.message || 'Operación completada.'}`);
                playerFideIdInput.value = ''; // Limpiar input
            } else {
                // Error lógico devuelto por la función
                alert(`Error al añadir: ${result.data.error || 'Error desconocido devuelto por el servidor.'}`);
            }
        })
        .catch(error => {
            // Error en la llamada HTTPS
            console.error('Error al llamar a Cloud Function (addPlayerByFideId):', error);
            alert(`Error de Comunicación con el Servidor: ${error.message}.`);
        })
        .finally(() => {
            // Volver a habilitar botón
            addPlayerBtn.disabled = false;
            addPlayerBtn.textContent = 'Añadir/Buscar Jugador';
        });
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

// Maneja el clic en "Actualizar Todos (FIDE)"
function handleManualUpdateAll() {
    console.log("Botón 'Actualizar Todos (FIDE)' presionado.");
    // Verificar que la referencia a la función exista
    if (!manualUpdateAllPlayersFunction) {
        alert("Error: La función de actualización masiva no está lista. Intenta recargar.");
        console.error("handleManualUpdateAll: manualUpdateAllPlayersFunction es null.");
        return;
    }
    // Confirmación del usuario
    if (!confirm("¿Iniciar actualización masiva desde FIDE? Esto contactará a la FIDE para cada jugador con ID y puede tardar.")) {
        console.log("Actualización masiva cancelada.");
        return;
    }

    console.log("Llamando a Cloud Function 'manualUpdateAllPlayers'...");

    // --- Actualizar UI para indicar progreso ---
    if (updateAllBtn) {
        updateAllBtn.disabled = true;
        updateAllBtn.textContent = 'Actualizando...'; // Cambiar texto botón
    }
    if (updateAllStatusElement) {
        updateAllStatusElement.textContent = 'Procesando jugadores... ⏳';
        updateAllStatusElement.className = 'status-processing'; // Aplicar estilo CSS
        updateAllStatusElement.style.display = 'inline-block'; // Mostrar el span
    }

    // Llamar a la Cloud Function 'manualUpdateAllPlayers'
    manualUpdateAllPlayersFunction()
        .then(result => {
            console.log("Respuesta de 'manualUpdateAllPlayers':", result.data);
            const message = result.data.message || (result.data.success ? 'Proceso completado.' : 'Error desconocido.');
            if (result.data.success) {
                // --- Mostrar Éxito ---
                if (updateAllStatusElement) {
                    updateAllStatusElement.textContent = `Éxito: ${message} 👍`;
                    updateAllStatusElement.className = 'status-success';
                }
                alert(`Éxito: ${message}`); // Alert final de confirmación
            } else {
                // --- Mostrar Error (lógico de la función) ---
                if (updateAllStatusElement) {
                    updateAllStatusElement.textContent = `Error: ${message} ❌`;
                    updateAllStatusElement.className = 'status-error';
                }
                alert(`Error Actualización: ${message}`); // Alert final de error
            }
        })
        .catch(error => {
            // --- Mostrar Error (de comunicación HTTPS) ---
            console.error('Error llamada Cloud Function (manualUpdateAllPlayers):', error);
            if (updateAllStatusElement) {
                updateAllStatusElement.textContent = `Error Comunicación: ${error.message} 🔌`;
                updateAllStatusElement.className = 'status-error';
            }
            alert(`Error de Comunicación: ${error.message}. Revisa consola.`);
        })
        .finally(() => {
            // --- Restaurar UI al finalizar ---
            if (updateAllBtn) {
                updateAllBtn.disabled = false;
                updateAllBtn.textContent = 'Actualizar Todos (FIDE)'; // Restaurar texto botón
            }
            // Opcional: Ocultar mensaje de estado tras unos segundos
            setTimeout(() => {
                if (updateAllStatusElement) {
                    // Podríamos ocultarlo o simplemente dejar el último estado visible
                    // updateAllStatusElement.style.display = 'none';
                }
            }, 8000); // Ocultar/limpiar después de 8 segundos
        });
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
        addPlayerByFideIdFunction = null;
        manualUpdateAllPlayersFunction = null;
        console.log("Referencias Cloud Functions reseteadas (logout).");
    }
}

// --- Exponer funciones necesarias al scope global ---
// Necesario para que el `onclick="handleDeletePlayer(...)"` funcione
window.handleDeletePlayer = handleDeletePlayer;

console.log("admin.js cargado y configurado.");
// --- Fin de js/admin.js ---