# Albaranes

Aplicación de escritorio para Windows que archiva **albaranes escaneados**.

## Qué hace

A partir de un PDF escaneado (con uno o con muchos albaranes), de imágenes JPG/PNG/GIF o escaneando directamente desde la app:

1. **Separa cada página** en un PDF independiente.
2. **Lee el número de albarán y la fecha** de cada página (OCR, sin internet).
3. **Nombra cada archivo con su número**, por ejemplo `A1050.pdf`.
4. **Lo guarda en la carpeta de su mes**: `Documentos\Albaranes\2026\09 - Septiembre\A1050.pdf`.
5. **Dice qué albaranes faltan** en un intervalo, por ejemplo del A500 al A700.

Antes de guardar se muestra una pantalla de revisión. Los albaranes dudosos (número que parece incompleto, sin fecha, repetidos o ya guardados) salen marcados en amarillo para corregirlos con un clic.

Además:
- **Imágenes**: al importar o arrastrar fotos o escaneos en JPG, PNG, GIF, WEBP o BMP se convierten a PDF automáticamente.
- **Botón Escanear** (debajo de Importar PDF): abre la ventana de escaneo de Windows (WIA, funciona con casi cualquier escáner) y permite escanear varias páginas seguidas.
- **Cambiar carpeta** (abajo en el menú): elegir en qué carpeta se guardan los albaranes y copiar allí los existentes. La carpeta anterior no se borra.
- Búsqueda por número, notas en cada albarán, y copia de seguridad de todo en la carpeta que elijas (por ejemplo, un pendrive).

## Descargar el instalador

Cada vez que se suben cambios a GitHub se genera y se prueba el instalador automáticamente:

1. Con la sesión de GitHub iniciada, abre https://github.com/cliserca-rgb/albaran/releases/latest
2. En **Assets**, descarga `Albaranes.Setup.x.y.z.exe` y ábrelo.

Windows puede mostrar "Windows protegió su PC" porque el instalador no está firmado: pulsa **Más información → Ejecutar de todas formas**.

## Desarrollo

Requiere Node.js 22.

```bash
npm install
npm start        # abre la app
npm test         # pruebas
npm run dist     # genera el instalador (en Windows)
```

## Estructura

- `src/main.js` — proceso principal de Electron (ventana, diálogos, comunicación)
- `src/preload.js` — puente seguro entre la interfaz y el proceso principal
- `src/lector.js` — separa el PDF (pdf-lib), renderiza cada página (pdf.js) y lee la cabecera con OCR (tesseract.js)
- `src/escaner.js` — escaneo con WIA mediante PowerShell (solo Windows)
- `src/db.js` — biblioteca: carpetas por mes e índice SQLite (sql.js)
- `src/renderer/` — interfaz (HTML, CSS, JS)
- `test/` — pruebas; `test/ejemplos/ejemplo.pdf` es un albarán inventado (se regenera con `node scripts/crear-ejemplo.js`)
