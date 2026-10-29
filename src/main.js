const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { Biblioteca } = require('./db');

let biblioteca;
let ventana;

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Albaranes',
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

function conUrl(fila) {
  return fila && { ...fila, url: pathToFileURL(biblioteca.rutaArchivo(fila)).href };
}

function importarVarios(rutas) {
  const importados = [];
  const errores = [];
  for (const ruta of rutas) {
    try {
      importados.push(conUrl(biblioteca.importar(ruta)));
    } catch (e) {
      errores.push(e.message);
    }
  }
  return { importados, errores };
}

ipcMain.handle('listar', (_e, filtro) => biblioteca.listar(filtro).map(conUrl));
ipcMain.handle('obtener', (_e, id) => conUrl(biblioteca.obtener(id)));
ipcMain.handle('actualizar', (_e, id, cambios) => conUrl(biblioteca.actualizar(id, cambios)));
ipcMain.handle('importar-rutas', (_e, rutas) => importarVarios(rutas));

ipcMain.handle('importar-dialogo', async () => {
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Subir albaranes',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  return r.canceled ? { importados: [], errores: [] } : importarVarios(r.filePaths);
});

ipcMain.handle('eliminar', async (_e, id) => {
  const fila = biblioteca.obtener(id);
  if (!fila) return false;
  const { response } = await dialog.showMessageBox(ventana, {
    type: 'warning',
    buttons: ['Cancelar', 'Eliminar'],
    defaultId: 0,
    cancelId: 0,
    message: '¿Eliminar este albarán?',
    detail: `${fila.numero || fila.nombre_original}\nSe borrará también el PDF guardado.`,
  });
  return response === 1 && biblioteca.eliminar(id);
});

ipcMain.handle('abrir-externo', (_e, id) => {
  const fila = biblioteca.obtener(id);
  if (fila) shell.openPath(biblioteca.rutaArchivo(fila));
});

ipcMain.handle('abrir-carpeta-datos', () => shell.openPath(biblioteca.dir));

ipcMain.handle('copia-seguridad', async () => {
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Elige dónde guardar la copia de seguridad',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled) return null;
  return biblioteca.copiaSeguridad(r.filePaths[0]);
});

app.whenReady().then(async () => {
  biblioteca = await Biblioteca.abrir(path.join(app.getPath('userData'), 'biblioteca'));
  crearVentana();
});

app.on('window-all-closed', () => app.quit());
