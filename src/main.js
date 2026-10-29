const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { Biblioteca } = require('./db');
const { Lector } = require('./lector');

let biblioteca;
let lector;
let ventana;
const lotes = new Map(); // id de lote -> carpeta temporal con las páginas separadas

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: 'Albaranes',
    backgroundColor: '#f4f6fa',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true, // visor de PDF integrado
    },
  });
  ventana.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

const url = (ruta) => pathToFileURL(ruta).href;
const conUrl = (fila) => fila && { ...fila, url: url(biblioteca.rutaArchivo(fila)) };

function borrarLote(id) {
  const carpeta = lotes.get(id);
  if (carpeta) fs.rmSync(carpeta, { recursive: true, force: true });
  lotes.delete(id);
}

// Separa y lee uno o varios PDF. Las páginas quedan en una carpeta temporal hasta que se guardan.
async function procesar(rutas) {
  if (!lector) lector = new Lector({ cacheDir: app.getPath('userData') });
  const id = `${Date.now()}`;
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'albaranes-'));
  lotes.set(id, carpeta);

  const paginas = [];
  const errores = [];
  for (const [i, ruta] of rutas.entries()) {
    const nombre = path.basename(ruta);
    try {
      const leidas = await lector.procesar(ruta, path.join(carpeta, String(i)), ({ pagina, total }) =>
        ventana.webContents.send('progreso', { nombre, pagina, total, archivo: i + 1, archivos: rutas.length })
      );
      for (const p of leidas) {
        paginas.push({ ...p, origen: nombre, url: url(p.archivo), yaExiste: !!p.numero && biblioteca.existe(p.numero) });
      }
    } catch (e) {
      errores.push(`${nombre}: ${e.message}`);
    }
  }
  return { lote: id, paginas, errores };
}

ipcMain.handle('elegir-pdf', async () => {
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Elige el PDF escaneado',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('procesar', (_e, rutas) => procesar(rutas.filter((r) => r.toLowerCase().endsWith('.pdf'))));
ipcMain.handle('existe', (_e, numero) => biblioteca.existe(numero));
ipcMain.handle('guardar-lote', (_e, id, paginas) => {
  const r = biblioteca.guardarLote(paginas);
  borrarLote(id);
  return r;
});
ipcMain.handle('descartar-lote', (_e, id) => borrarLote(id));

ipcMain.handle('arbol', () => biblioteca.arbol());
ipcMain.handle('listar', (_e, filtro) => biblioteca.listar(filtro).map(conUrl));
ipcMain.handle('obtener', (_e, id) => conUrl(biblioteca.obtener(id)));
ipcMain.handle('actualizar', (_e, id, cambios) => conUrl(biblioteca.actualizar(id, cambios)));
ipcMain.handle('faltantes', (_e, desde, hasta) => biblioteca.faltantes(desde, hasta));

ipcMain.handle('eliminar', async (_e, id) => {
  const fila = biblioteca.obtener(id);
  if (!fila) return false;
  const { response } = await dialog.showMessageBox(ventana, {
    type: 'warning',
    buttons: ['Cancelar', 'Eliminar'],
    defaultId: 0,
    cancelId: 0,
    message: `¿Eliminar el albarán ${fila.numero}?`,
    detail: 'Se borrará también su archivo PDF.',
  });
  return response === 1 && biblioteca.eliminar(id);
});

ipcMain.handle('abrir-externo', (_e, id) => {
  const fila = biblioteca.obtener(id);
  if (fila) shell.openPath(biblioteca.rutaArchivo(fila));
});
ipcMain.handle('mostrar-en-carpeta', (_e, id) => {
  const fila = biblioteca.obtener(id);
  if (fila) shell.showItemInFolder(biblioteca.rutaArchivo(fila));
});
ipcMain.handle('abrir-carpeta-datos', () => shell.openPath(biblioteca.raiz));
ipcMain.handle('carpeta-datos', () => biblioteca.raiz);

ipcMain.handle('copia-seguridad', async () => {
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Elige dónde guardar la copia de seguridad (por ejemplo, un pendrive)',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled) return null;
  return biblioteca.copiaSeguridad(r.filePaths[0]);
});

// Autoprueba de la app ya instalada (la usa GitHub Actions): `Albaranes.exe --autoprueba ruta.pdf`
// lee el PDF, escribe el resultado y se cierra con código 0 si ha leído número y fecha de cada página.
async function autoprueba(ruta) {
  let codigo = 1;
  try {
    const l = new Lector({ cacheDir: app.getPath('temp') });
    const paginas = await l.procesar(ruta, fs.mkdtempSync(path.join(os.tmpdir(), 'albaranes-prueba-')));
    await l.terminar();
    const resumen = paginas.map((p) => `${p.pagina}: ${p.numero || '?'} ${p.fecha || '?'}`);
    console.log(`AUTOPRUEBA ${paginas.length} páginas\n${resumen.join('\n')}`);
    codigo = paginas.length && paginas.every((p) => p.numero && p.fecha) ? 0 : 1;
  } catch (e) {
    console.error('AUTOPRUEBA ERROR', e);
  }
  app.exit(codigo);
}

app.whenReady().then(async () => {
  const iPrueba = process.argv.indexOf('--autoprueba');
  if (iPrueba > 0) return autoprueba(process.argv[iPrueba + 1]);
  biblioteca = await Biblioteca.abrir(path.join(app.getPath('documents'), 'Albaranes'));
  crearVentana();
});

app.on('window-all-closed', async () => {
  for (const id of [...lotes.keys()]) borrarLote(id);
  if (lector) await lector.terminar();
  app.quit();
});
