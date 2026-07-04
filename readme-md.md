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

## Mantenimiento / actualización mensual de ELOs

La actualización de los ELOs desde FIDE se hace **automáticamente una vez al mes**, mediante dos Cloud Functions programadas:
- `updateAllElos` — todos los días a las **05:00 UTC**
- `updateAllElosAfternoon` — todos los días a las **17:00 UTC** (solo actúa los días 1–12 del mes)

### Lógica mensual
- Ambas funciones se ejecutan a diario, pero sólo actualizan cuando detectan un **nuevo mes** respecto al timestamp guardado en `system_metadata/last_fide_update`.
- La **ventana de actualización** es del **día 1 al 12** de cada mes, para dar tiempo a que FIDE publique los nuevos ELOs (no todos los meses publican el día 1).
- La función de la tarde (17:00) es el **respaldo** de la de la mañana: si la primera falla, la segunda reintenta el mismo día.
- La ejecución es robusta: **no sobrescribe** un ELO válido con `0` ni con valores fuera de rango (100–3500). Si el scraping no es fiable, cuenta como error y deja el ELO anterior intacto.
- El mes **sólo se marca como "hecho"** si la actualización tuvo éxito (sin errores significativos, ≤ 10 % de jugadores con fallo). Si no, **no se marca** y se reintenta en la siguiente ventana.
- Cada ejecución registra un documento en la colección `update_logs` para auditoría.

### Alertas por email (opcional)
El código ya incluye el envío de email de alerta usando **Resend**, pero está desactivado. Para activarlo hay que declarar los secrets y redesplegar:

```bash
firebase functions:secrets:set RESEND_API_KEY   # API key de Resend (re_xxx)
firebase functions:secrets:set ALERT_EMAIL_TO   # email del admin destinatario
firebase functions:secrets:set ALERT_EMAIL_FROM # remitente verificado en Resend
```

Y añadir en `functions/index.js`, dentro del `runWith` de `updateAllElos` y `updateAllElosAfternoon`:
```js
secrets: ['RESEND_API_KEY', 'ALERT_EMAIL_TO', 'ALERT_EMAIL_FROM']
```
Luego `firebase deploy --only functions`. Mientras tanto, la función `sendUpdateAlert` simplemente loggea un warning y no envía nada.

## Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue o un pull request para cualquier mejora o corrección.

## Licencia

Este proyecto está licenciado bajo la Licencia MIT.
