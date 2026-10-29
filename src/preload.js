const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  elegirPdf: () => ipcRenderer.invoke('elegir-pdf'),
  rutasDe: (files) => [...files].map((f) => webUtils.getPathForFile(f)),
  procesar: (rutas) => ipcRenderer.invoke('procesar', rutas),
  alProgresar: (fn) => ipcRenderer.on('progreso', (_e, datos) => fn(datos)),
  existe: (numero) => ipcRenderer.invoke('existe', numero),
  guardarLote: (lote, paginas) => ipcRenderer.invoke('guardar-lote', lote, paginas),
  descartarLote: (lote) => ipcRenderer.invoke('descartar-lote', lote),

  arbol: () => ipcRenderer.invoke('arbol'),
  listar: (filtro) => ipcRenderer.invoke('listar', filtro),
  obtener: (id) => ipcRenderer.invoke('obtener', id),
  actualizar: (id, cambios) => ipcRenderer.invoke('actualizar', id, cambios),
  eliminar: (id) => ipcRenderer.invoke('eliminar', id),
  faltantes: (desde, hasta) => ipcRenderer.invoke('faltantes', desde, hasta),

  abrirExterno: (id) => ipcRenderer.invoke('abrir-externo', id),
  mostrarEnCarpeta: (id) => ipcRenderer.invoke('mostrar-en-carpeta', id),
  abrirCarpetaDatos: () => ipcRenderer.invoke('abrir-carpeta-datos'),
  carpetaDatos: () => ipcRenderer.invoke('carpeta-datos'),
  copiaSeguridad: () => ipcRenderer.invoke('copia-seguridad'),
});
