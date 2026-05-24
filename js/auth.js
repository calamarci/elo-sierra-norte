// --- Inicio de js/auth.js (Versión COMPAT) ---

// Obtener la instancia de Auth del objeto global firebase (inicializado en firebase-config.js)
const auth = firebase.auth();
console.log("Instancia de Firebase Auth (compat) obtenida.");

// Estado de autenticación (variable local, no la exportamos directamente)
let currentAuthUser = null;

// Función para iniciar sesión
function loginUser(email, password) {
    console.log(`Intentando login (compat) para: ${email}`);
    // Usamos la instancia 'auth' obtenida arriba
    return auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // El listener onAuthStateChanged manejará la actualización de currentAuthUser
            console.log("Login exitoso (compat), userCredential obtenido:", userCredential.user.email);
            return userCredential.user; // Devolver el usuario por si se necesita inmediatamente
        });
    // El .catch() se manejará donde se llame a loginUser (en admin.js)
}

// Función para cerrar sesión
function logoutUser() {
    console.log("Intentando logout (compat)...");
    return auth.signOut()
        .then(() => {
             // El listener onAuthStateChanged manejará la actualización de currentAuthUser a null
            console.log("Logout exitoso (compat).");
        });
     // El .catch() se manejará donde se llame a logoutUser (en admin.js)
}

// Función para verificar estado de autenticación y llamar al callback
// El callback (ej: updateUIForAuthState en admin.js) se ejecutará inmediatamente
// y cada vez que el estado cambie (login/logout).
function checkAuthState(callback) {
    console.log("Estableciendo listener onAuthStateChanged (compat)...");
    return auth.onAuthStateChanged((user) => {
        console.log("onAuthStateChanged (compat) detectó un cambio. Usuario:", user ? user.email : 'null');
        currentAuthUser = user; // Actualizar estado local
        if (callback) {
            callback(user); // Llamar a la función que actualiza la UI
        }
    });
    // Devuelve la función para desuscribirse (unsubscribe), aunque no la estamos usando explícitamente aquí
}

// Función para verificar si el usuario está logueado (basado en la variable local)
function isUserLoggedIn() {
    return currentAuthUser !== null;
}

// Función para obtener el usuario actual (desde la variable local)
function getCurrentUser() {
    return currentAuthUser;
}

// --- Fin de js/auth.js (Versión COMPAT) ---