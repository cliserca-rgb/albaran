const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { Biblioteca } = require('./db');
const { Lector, esImagen, EXT_IMAGEN } = require('./lector');
const escaner = require('./escaner');

let biblioteca;
let lector;
let ventana;
const lotes = new Map(); // id de lote -> carpeta temporal con las páginas separadas
const temporales = []; // carpetas con páginas escaneadas, se borran al cerrar

// ---------- Ajustes (carpeta de los albaranes) ----------
const rutaAjustes = () => path.join(app.getPath('userData'), 'ajustes.json');
const carpetaPorDefecto = () => path.join(app.getPath('documents'), 'Albaranes');

function leerAjustes() {
  try {
    return JSON.parse(fs.readFileSync(rutaAjustes(), 'utf8'));
  } catch {
    return {};
  }
}

function guardarAjustes(ajustes) {
  fs.mkdirSync(path.dirname(rutaAjustes()), { recursive: true });
  fs.writeFileSync(rutaAjustes(), JSON.stringify(ajustes, null, 2));
}

const dentroDe = (hija, madre) => path.resolve(hija).toLowerCase().startsWith(path.resolve(madre).toLowerCase() + path.sep);

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
  lector.cifrasHabituales = biblioteca.cifrasHabituales();
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
    title: 'Elige el PDF o las imágenes escaneadas',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'PDF o imágenes', extensions: ['pdf', ...EXT_IMAGEN.map((e) => e.slice(1))] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Imágenes (JPG, PNG…)', extensions: EXT_IMAGEN.map((e) => e.slice(1)) },
    ],
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('procesar', (_e, rutas) => procesar(rutas.filter((r) => r.toLowerCase().endsWith('.pdf') || esImagen(r))));

// Escanea una o varias páginas seguidas con el escáner del PC y devuelve las imágenes.
ipcMain.handle('puede-escanear', () => escaner.disponible);
ipcMain.handle('escanear', async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'albaranes-escaneo-'));
  temporales.push(carpeta);
  const paginas = [];
  for (;;) {
    const destino = path.join(carpeta, `escaneo-${String(paginas.length + 1).padStart(3, '0')}.jpg`);
    try {
      await escaner.escanearPagina(destino);
    } catch (e) {
      if (!paginas.length) throw e; // primera hoja: el aviso se muestra en la ventana de la app
      // Ya hay hojas escaneadas: no se pierden; se puede reintentar o terminar con las que hay.
      const { response } = await dialog.showMessageBox(ventana, {
        type: 'warning',
        buttons: ['Reintentar', 'Terminar y leer'],
        defaultId: 0,
        cancelId: 1,
        message: 'No se ha podido escanear la página',
        detail: `${e.message}\n\nLas ${paginas.length} páginas ya escaneadas no se pierden.`,
      });
      if (response === 0) continue;
      break;
    }
    paginas.push(destino);
    const { response } = await dialog.showMessageBox(ventana, {
      type: 'question',
      buttons: ['Escanear otra página', 'Terminar y leer'],
      defaultId: 0,
      cancelId: 1,
      message: `Página ${paginas.length} escaneada`,
      detail: 'Pon el siguiente albarán en el escáner y pulsa «Escanear otra página», o pulsa «Terminar y leer» si ya están todos.',
    });
    if (response === 1) break;
  }
  return paginas;
});
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
ipcMain.handle('carpeta-datos', () => ({ actual: biblioteca.raiz, porDefecto: carpetaPorDefecto() }));

// Cambia la carpeta donde se guardan los albaranes. Si la nueva ya tiene una biblioteca, se usa esa;
// si no, se puede copiar allí la actual. La carpeta anterior nunca se borra.
ipcMain.handle('cambiar-carpeta', async (_e, opciones = {}) => {
  let nueva = opciones.ruta;
  if (!nueva) {
    const r = await dialog.showOpenDialog(ventana, {
      title: 'Elige la carpeta donde se guardarán los albaranes',
      defaultPath: biblioteca.raiz,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled) return null;
    nueva = r.filePaths[0];
  }
  const actual = biblioteca.raiz;
  if (path.resolve(nueva).toLowerCase() === path.resolve(actual).toLowerCase()) return null;
  if (dentroDe(nueva, actual) || dentroDe(actual, nueva)) {
    throw new Error('Elige una carpeta que no esté dentro de la actual (ni la contenga).');
  }

  const yaTieneBiblioteca = fs.existsSync(path.join(nueva, 'albaranes.db'));
  const { total } = biblioteca.arbol();
  let copiar = false;
  if (yaTieneBiblioteca) {
    const { response } = await dialog.showMessageBox(ventana, {
      type: 'question',
      buttons: ['Cancelar', 'Usar esa carpeta'],
      defaultId: 1,
      cancelId: 0,
      message: 'Esa carpeta ya tiene albaranes guardados',
      detail: `${nueva}\n\nLa app pasará a mostrar los albaranes de esa carpeta. Los de la carpeta actual se quedan donde están.`,
    });
    if (response === 0) return null;
  } else if (total > 0) {
    const { response } = await dialog.showMessageBox(ventana, {
      type: 'question',
      buttons: ['Cancelar', 'Empezar vacía', 'Copiar mis albaranes'],
      defaultId: 2,
      cancelId: 0,
      message: `¿Qué hago con tus ${total} albaranes?`,
      detail: `Nueva carpeta: ${nueva}\n\n«Copiar mis albaranes» los copia a la nueva carpeta (recomendado).\n«Empezar vacía» deja la biblioteca nueva sin albaranes.\n\nEn ningún caso se borra la carpeta actual.`,
    });
    if (response === 0) return null;
    copiar = response === 2;
  }

  biblioteca = copiar ? await biblioteca.copiarA(nueva) : await Biblioteca.abrir(nueva);
  guardarAjustes({ ...leerAjustes(), carpeta: nueva });
  return { actual: nueva, copiados: copiar ? total : 0 };
});

ipcMain.handle('copia-seguridad', async () => {
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Elige dónde guardar la copia de seguridad (por ejemplo, un pendrive)',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled) return null;
  return biblioteca.copiaSeguridad(r.filePaths[0]);
});

// Autoprueba de la app ya instalada (la usa GitHub Actions): `Albaranes.exe --autoprueba ruta.pdf informe.txt`
// lee el PDF, escribe el resultado en el informe y se cierra con código 0 si ha leído número y fecha de cada página.
async function autoprueba(ruta, informe) {
  let codigo = 1;
  let texto;
  const registro = (m) => fs.appendFileSync(informe, `${new Date().toISOString().slice(11, 19)} ${m}\n`);
  fs.writeFileSync(informe, '');
  registro(`inicio: electron ${process.versions.electron}, ${process.arch}`);
  try {
    const l = new Lector({ cacheDir: app.getPath('temp'), registro });
    const paginas = await l.procesar(ruta, fs.mkdtempSync(path.join(os.tmpdir(), 'albaranes-prueba-')));
    await l.terminar();
    texto = `${paginas.length} páginas: ` + paginas.map((p) => `${p.pagina}=${p.numero || '?'} ${p.fecha || '?'}`).join(', ');
    codigo = paginas.length && paginas.every((p) => p.numero && p.fecha) ? 0 : 1;
  } catch (e) {
    texto = `ERROR ${e.stack || e}`;
  }
  registro(texto);
  app.exit(codigo);
}

// Autoprueba del escáner (GitHub Actions no tiene escáner): comprueba que el aviso llega sin bloquearse.
async function autopruebaEscaner(informe) {
  try {
    const hecho = await escaner.escanearPagina(path.join(os.tmpdir(), 'albaranes-prueba-escaner.jpg'));
    fs.writeFileSync(informe, `sin error: ${hecho ? 'escaneado' : 'cancelado'}\n`);
  } catch (e) {
    fs.writeFileSync(informe, `aviso: ${e.message}\n`);
  }
  app.exit(0);
}

app.whenReady().then(async () => {
  const iEscaner = process.argv.indexOf('--autoprueba-escaner');
  if (iEscaner > 0) return autopruebaEscaner(process.argv[iEscaner + 1]);
  const iPrueba = process.argv.indexOf('--autoprueba');
  if (iPrueba > 0) return autoprueba(process.argv[iPrueba + 1], process.argv[iPrueba + 2]);
  const { carpeta } = leerAjustes();
  try {
    biblioteca = await Biblioteca.abrir(carpeta || carpetaPorDefecto());
  } catch (e) {
    // p. ej. una carpeta de red o un disco USB que ya no está conectado
    dialog.showErrorBox('No se puede abrir la carpeta de los albaranes', `${carpeta}\n\n${e.message}\n\nSe usará la carpeta por defecto. Puedes cambiarla en Ajustes.`);
    biblioteca = await Biblioteca.abrir(carpetaPorDefecto());
  }
  crearVentana();
});

app.on('window-all-closed', async () => {
  for (const id of [...lotes.keys()]) borrarLote(id);
  for (const c of temporales) fs.rmSync(c, { recursive: true, force: true });
  if (lector) await lector.terminar();
  app.quit();
});
