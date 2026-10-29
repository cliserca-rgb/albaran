# Albaranes — notas para Claude

- El usuario habla español y no programa: explica en español y en lenguaje sencillo.
- Trabaja desde varios equipos (oficina y casa) en sesiones en la nube: **haz commit y push al terminar cada parte** para no perder trabajo.
- App Electron para Windows; datos en SQLite vía `sql.js` (WASM, sin módulos nativos) dentro de `app.getPath('userData')/biblioteca`, y los PDF en `biblioteca/archivos/`.
- La capa de datos (`src/db.js`) no depende de Electron y se prueba con `npm test` (Node 22).
- En el contenedor en la nube no se puede descargar el binario de Electron; el instalador lo compila GitHub Actions (`.github/workflows/windows.yml`) en `windows-latest`.
- Pendiente: el usuario explicará cómo quiere que el sistema extraiga automáticamente los datos de los albaranes escaneados (OCR / IA). La columna `texto` está reservada para el texto extraído.
