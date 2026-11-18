# Reportes Coach

App web (funciona en celular y computadora, también sin internet) para que el coach:

- Registre **clientes** (sexo, edad, estatura, objetivo, notas).
- Capture las **mediciones de la báscula**: peso, IMC, % grasa, % músculo, RM (metabolismo en reposo), edad metabólica y grasa visceral. Se puede **pegar el texto** tal cual (`Peso:93.2`, `BMI:30.4`…) y se llenan los campos solos.
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

Los datos se guardan **solo en el dispositivo** (IndexedDB del navegador). En **Ajustes → Respaldo** se descarga un archivo `.json` que sirve para respaldar o pasar todo a otro dispositivo. Conviene respaldar seguido.

## Estructura

- `index.html`, `css/styles.css`
- `js/app.js` – pantallas e interacción
- `js/db.js` – almacenamiento local y respaldo
- `js/metrics.js` – métricas, rangos de referencia e interpretación de texto
- `js/pdf.js` – generación del PDF (jsPDF + AutoTable en `vendor/`)
- `sw.js`, `manifest.webmanifest` – instalación y uso sin conexión
