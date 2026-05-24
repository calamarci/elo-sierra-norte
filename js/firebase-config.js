
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCrdZCZZ8mi3Q-uH41N35E9U6HSMd0tKxk",
  authDomain: "sierra-norte-elo.firebaseapp.com",
  projectId: "sierra-norte-elo",
  storageBucket: "sierra-norte-elo.firebasestorage.app",
  messagingSenderId: "463902126312",
  appId: "1:463902126312:web:ec8d3c3e57857aba65595d",
  measurementId: "G-4E16NQRLNB"
};

// Inicializar Firebase usando el objeto global 'firebase'
try {
  // ESTA LÍNEA ES LA CLAVE: usa el 'firebase' global
  firebase.initializeApp(firebaseConfig);
  console.log("Firebase inicializado correctamente (compat) desde firebase-config.js.");

} catch (error) {
  console.error("Error inicializando Firebase desde firebase-config.js:", error);
  alert("Error crítico al conectar con la configuración del servidor. La aplicación no funcionará correctamente.");
}