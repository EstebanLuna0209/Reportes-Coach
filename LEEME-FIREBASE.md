# Activar la nube (Firebase) — paso a paso

Con esto el coach entra con su correo y contraseña y ve **los mismos clientes en celular, tablet y computadora**. También funciona sin internet: los cambios se suben solos al reconectar. Es **gratis** con el plan Spark para este uso.

Toma unos 15 minutos y solo se hace una vez.

## 1. Crear el proyecto

1. Entra a <https://console.firebase.google.com> con una cuenta de Google (de preferencia la del coach).
2. **Crear un proyecto** → nombre, por ejemplo `reportes-coach` → puedes desactivar Google Analytics → **Crear**.

## 2. Activar el inicio de sesión

1. Menú izquierdo: **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso** → **Correo electrónico/contraseña** → **Habilitar** (solo la primera opción) → **Guardar**.

## 3. Activar la base de datos

1. Menú: **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: `nam5 (United States)` o la más cercana → **Siguiente**.
3. Elige **Comenzar en modo de producción** → **Crear**.
4. Pestaña **Reglas**: borra lo que hay, pega el contenido del archivo [`firestore.rules`](firestore.rules) de este proyecto y presiona **Publicar**.
   (Estas reglas hacen que cada cuenta solo pueda ver sus propios datos.)

## 4. Conectar la app

1. Ícono de engrane ⚙️ → **Configuración del proyecto** → abajo en **Tus apps** → botón **`</>`** (Web).
2. Nombre: `Reportes Coach` → **Registrar app** (no es necesario marcar Hosting aquí).
3. Te mostrará un bloque así:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "reportes-coach.firebaseapp.com",
     projectId: "reportes-coach",
     storageBucket: "reportes-coach.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```

4. Abre el archivo [`js/firebase-config.js`](js/firebase-config.js) y reemplaza `null` por ese objeto:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "reportes-coach.firebaseapp.com",
     projectId: "reportes-coach",
     storageBucket: "reportes-coach.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```

   Estos datos **no son secretos** (identifican al proyecto); la seguridad la dan las reglas del paso 3.

## 5. Publicar la app

Opción A — **GitHub Pages** (más sencillo si ya usas GitHub): en el repositorio, *Settings → Pages → Deploy from a branch* → elige la rama y la carpeta `/ (root)`. Después agrega ese dominio (`tuusuario.github.io`) en Firebase: **Authentication → Configuración → Dominios autorizados → Agregar dominio**.

Opción B — **Firebase Hosting** (todo en un mismo lugar): con Node instalado, desde la carpeta del proyecto:

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # elige tu proyecto
firebase deploy           # publica la app y las reglas
```

La app quedará en `https://TU-PROYECTO.web.app`.

## 6. Primer uso

1. Abre la app → **Crear cuenta (primera vez)** con el correo y contraseña del coach.
2. Si ya tenía clientes guardados en ese dispositivo, la app ofrecerá **subirlos a la nube**.
3. En los demás dispositivos solo hay que **Entrar** con el mismo correo.
4. En el celular/tablet: menú del navegador → **Agregar a pantalla de inicio**.

**Opcional:** aunque alguien más creara una cuenta, no podría ver los datos del coach (cada cuenta solo ve los suyos). Si en **Authentication → Configuración → Acciones del usuario** aparece la opción *Habilitar creación (registro)*, puedes desactivarla cuando el coach ya tenga su cuenta.
