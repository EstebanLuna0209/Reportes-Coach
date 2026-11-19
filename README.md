# Reportes Coach

App web (funciona en celular y computadora, también sin internet) para que el coach:

- Registre **clientes** (sexo, edad, estatura, objetivo, notas).
- Capture las **mediciones de la báscula**: peso, IMC, % grasa, % músculo, RM (metabolismo en reposo), edad metabólica y grasa visceral. Se puede **pegar el texto** tal cual (`Peso:93.2`, `BMI:30.4`…) y se llenan los campos solos.
- Capture opcionalmente **medidas con cinta** (cuello, pecho, brazo, cintura, abdomen, cadera, muslo, pantorrilla) y **datos extra de InBody** (músculo esquelético, masa grasa, agua, proteína, minerales, puntuación).
- Vea las **calorías y macros aproximados** de cada comida y del día (base de ~65 alimentos comunes en México + alimentos propios del coach en *Plantillas → Mis alimentos*).
- Arme la **dieta** y la **rutina** de cada cliente (o pegue el texto de WhatsApp) y guarde **plantillas** para reutilizarlas.
- Genere y **comparta por WhatsApp** un **PDF estilo InBody** con:
  - Tabla de composición corporal (actual vs anterior vs inicio, con flechas de mejora).
  - Análisis músculo‑grasa con barras y rangos de referencia (según sexo, edad y estatura).
  - Resumen automático del progreso + comentarios del coach.
  - Gráficas de evolución e historial de mediciones.
  - Plan de alimentación y rutina de entrenamiento.

## Cómo usarla

Es un sitio estático (HTML/JS, sin servidor). Para publicarla gratis con **GitHub Pages**:
Settings → Pages → *Deploy from a branch* → elegir la rama y la carpeta `/ (root)`.
Después, desde el celular del coach, abrir la URL y “Agregar a pantalla de inicio”.

Para probar en local: `python3 -m http.server` y abrir `http://localhost:8000`.

## Datos

- **Con Firebase (recomendado):** el coach entra con correo y contraseña y ve los mismos datos en celular, tablet y computadora, con sincronización en vivo y funcionamiento sin internet. Configuración paso a paso en [LEEME-FIREBASE.md](LEEME-FIREBASE.md).
- **Sin Firebase:** mientras `js/firebase-config.js` tenga `null`, la app guarda todo solo en el dispositivo (IndexedDB).

En ambos casos, **Ajustes → Respaldo** descarga una copia `.json` de todos los datos.

## Estructura

- `index.html`, `css/styles.css`
- `js/app.js` – pantallas e interacción
- `js/db.js` – almacenamiento (local o Firestore) y respaldo
- `js/firebase-config.js` – configuración de Firebase
- `firestore.rules`, `firebase.json` – reglas de seguridad y publicación en Firebase Hosting
- `js/metrics.js` – métricas, rangos de referencia e interpretación de texto
- `js/nutrition.js` – base de alimentos y cálculo de calorías/macros
- `js/pdf.js` – generación del PDF (jsPDF + AutoTable en `vendor/`; `vendor/firebase.js` es el SDK de Firebase 10.14.1 empaquetado)
- `sw.js`, `manifest.webmanifest` – instalación y uso sin conexión
