# Albaranes

Aplicación de escritorio para Windows que archiva **albaranes escaneados**.

## Qué hace

A partir de un PDF escaneado, con uno o con muchos albaranes:

1. **Separa cada página** en un PDF independiente.
2. **Lee el número de albarán y la fecha** de cada página (OCR, sin internet).
3. **Nombra cada archivo con su número**, por ejemplo `A1050.pdf`.
4. **Lo guarda en la carpeta de su mes**: `Documentos\Albaranes\2026\09 - Septiembre\A1050.pdf`.
5. **Dice qué albaranes faltan** en un intervalo, por ejemplo del A500 al A700.

Antes de guardar se muestra una pantalla de revisión. Los albaranes dudosos (número que parece incompleto, sin fecha, repetidos o ya guardados) salen marcados en amarillo para corregirlos con un clic.

Además: búsqueda por número, notas en cada albarán, y copia de seguridad de todo en la carpeta que elijas (por ejemplo, un pendrive).

## Descargar el instalador

Cada vez que se suben cambios a GitHub se genera y se prueba el instalador automáticamente:

1. Abre https://github.com/cliserca-rgb/albaran/actions (desde el navegador del ordenador).
2. Entra en la última ejecución con ✅ verde.
3. Abajo, en **Artifacts**, descarga **Albaranes-instalador** y descomprímelo.
4. Ejecuta `Albaranes Setup x.y.z.exe`.

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
- `src/db.js` — biblioteca: carpetas por mes e índice SQLite (sql.js)
- `src/renderer/` — interfaz (HTML, CSS, JS)
- `test/` — pruebas; `test/ejemplos/ejemplo.pdf` es un albarán inventado (se regenera con `node scripts/crear-ejemplo.js`)
