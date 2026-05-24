# Sistema de Rankings ELO para Club de Ajedrez

Este proyecto es una aplicación web simple para gestionar los rankings ELO de un club de ajedrez. Permite visualizar públicamente los rankings de los jugadores y proporciona un panel de administración protegido con autenticación para actualizar la información.

## Características

- **Vista pública** para cualquier persona que quiera ver los rankings
- **Panel de administración** protegido por contraseña
- **Autenticación** para administradores
- **Base de datos** en tiempo real
- **Búsqueda** de jugadores por nombre
- **Actualizaciones en tiempo real** cuando cambian los datos

## Tecnologías utilizadas

- HTML5, CSS3, JavaScript
- Firebase (Firestore para base de datos, Authentication para autenticación)
- GitHub Pages para el hosting

## Configuración del proyecto

### 1. Crear un proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/) y crea una cuenta si no tienes una
2. Haz clic en "Añadir proyecto" y sigue los pasos para crear un nuevo proyecto
3. Una vez creado, haz clic en "Web" para añadir una aplicación web
4. Registra la aplicación con un nombre y copia la configuración de Firebase que se te proporciona

### 2. Configurar Firebase Authentication

1. En la consola de Firebase, ve a "Authentication" en el menú lateral
2. Haz clic en "Comenzar" y luego activa el proveedor de "Correo electrónico/contraseña"
3. Ve a la pestaña "Usuarios" y haz clic en "Añadir usuario"
4. Crea un usuario administrador con correo y contraseña

### 3. Configurar Firestore Database

1. En la consola de Firebase, ve a "Firestore Database" en el menú lateral
2. Haz clic en "Crear base de datos" y selecciona "Comenzar en modo de prueba"
3. Selecciona la ubicación más cercana a tus usuarios
4. Crea una colección llamada "players"

### 4. Configurar GitHub Pages

1. Crea un nuevo repositorio en GitHub
2. Clona el repositorio a tu máquina local
3. Copia todos los archivos de este proyecto en tu repositorio local
4. Actualiza el archivo `firebase-config.js` con la configuración de tu proyecto Firebase
5. Haz commit y push a GitHub
6. En los ajustes del repositorio, activa GitHub Pages seleccionando la rama principal

## Uso

### Vista pública

La página principal (`index.html`) muestra la lista de jugadores ordenados por su ranking ELO. Los usuarios pueden buscar jugadores por nombre.

### Panel de administración

El panel de administración (`admin.html`) permite:

- Añadir nuevos jugadores con un ELO inicial
- Actualizar el ELO de jugadores existentes
- Eliminar jugadores

Para acceder al panel de administración, debes iniciar sesión con las credenciales de administrador que configuraste en Firebase Authentication.

## Desarrollo local

1. Clona este repositorio
2. Actualiza la configuración de Firebase en `js/firebase-config.js`
3. Abre `index.html` en tu navegador

## Notas para desarrolladores

- La estructura de datos en Firestore es simple: una colección "players" donde cada documento representa un jugador con campos "name", "elo" y "lastUpdated"
- La autenticación está configurada solo para administradores predefinidos; no hay registro de usuarios públicos
- El plan gratuito de Firebase permite hasta 50,000 lecturas, 20,000 escrituras y 20,000 eliminaciones por día, lo que es suficiente para la mayoría de los clubes

## Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue o un pull request para cualquier mejora o corrección.

## Licencia

Este proyecto está licenciado bajo la Licencia MIT.
