# Albaranes — notas para Claude

- El usuario habla español y no programa: explica en español y en lenguaje sencillo.
- **No cambies el diseño ni el procedimiento actual (versión 0.2.0) por iniciativa propia.** Al usuario le gusta tal cual. Haz solo las modificaciones que pida, añadiéndolas sin tocar lo que ya hay (textos, botones, menú lateral, pasos de importación y revisión). Si una petición obliga a cambiar algo visible, pregunta antes.
- Trabaja desde varios equipos (oficina y casa) en sesiones en la nube: **haz commit y push al terminar cada parte** para no perder trabajo.
- Es una app para un cliente suyo (empresa "marc & chloe"). Requisitos del cliente: separar el PDF escaneado por páginas, nombrar cada página con su número de albarán (p. ej. A1050), guardarla en la carpeta de su mes, y decir qué números faltan en un intervalo.
- App Electron para Windows. Los PDF se guardan en `Documentos/Albaranes/<año>/<MM - Mes>/<número>.pdf` y el índice SQLite (`sql.js`, WASM) en `Documentos/Albaranes/albaranes.db`.
- OCR: `src/lector.js` (pdf-lib + pdfjs-dist con @napi-rs/canvas + tesseract.js, todo local y sin internet). Solo se lee la zona de cabecera (`ZONA_CABECERA`). Con los 19 escaneos reales de ejemplo acierta 18; el fallo (página torcida) se marca como dudoso en la pantalla de revisión.
- No subas al repositorio escaneos reales del cliente (tienen datos de terceros). Para pruebas usa `test/ejemplos/ejemplo.pdf` (inventado).
- `npm test` prueba datos y OCR en Node 22. En el contenedor en la nube no se puede descargar Electron: para ver la interfaz, cárgala en Playwright con un `window.api` simulado que llame a `Biblioteca`/`Lector` reales.
- El instalador lo compila GitHub Actions (`.github/workflows/windows.yml`), que además ejecuta `Albaranes.exe --autoprueba test/ejemplos/ejemplo.pdf` sobre la app empaquetada. Los errores se publican como anotaciones (los registros completos no son accesibles desde el contenedor).
