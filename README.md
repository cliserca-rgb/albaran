# Albaranes

Aplicación de escritorio para Windows que funciona como **biblioteca de albaranes escaneados**: subes los PDF, se guardan en el equipo y puedes ordenarlos, buscarlos y anotar sus datos.

## Qué hace (versión 0.1)

- Subir uno o varios PDF (botón **Subir PDF** o arrastrando los archivos a la ventana)
- Ver el PDF dentro de la app
- Anotar número, fecha, empresa, importe, estado y notas de cada albarán
- Buscar y filtrar por estado
- Copia de seguridad de todo (base de datos + PDF) en la carpeta que elijas

Los datos se guardan en `%APPDATA%\Albaranes\biblioteca` (botón **Carpeta de datos**).

## Descargar el instalador

Cada vez que se suben cambios a GitHub se genera el instalador automáticamente:

1. Ve a la pestaña **Actions** del repositorio.
2. Abre la última ejecución de **Instalador Windows** que esté en verde.
3. Abajo, en **Artifacts**, descarga **Albaranes-instalador** y descomprímelo.
4. Ejecuta `Albaranes Setup x.y.z.exe`.

Windows puede mostrar el aviso "Windows protegió su PC" porque el instalador no está firmado: pulsa **Más información → Ejecutar de todas formas**.

## Desarrollo

Requiere Node.js 22.

```bash
npm install
npm start        # abre la app
npm test         # pruebas de la capa de datos
npm run dist     # genera el instalador (en Windows)
```

## Estructura

- `src/main.js` — proceso principal de Electron (ventana, diálogos, comunicación)
- `src/preload.js` — puente seguro entre la interfaz y el proceso principal
- `src/db.js` — biblioteca: base SQLite (sql.js) y carpeta de PDF
- `src/renderer/` — interfaz (HTML, CSS, JS)
- `test/` — pruebas
