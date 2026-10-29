const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listar: (filtro) => ipcRenderer.invoke('listar', filtro),
  obtener: (id) => ipcRenderer.invoke('obtener', id),
  actualizar: (id, cambios) => ipcRenderer.invoke('actualizar', id, cambios),
  eliminar: (id) => ipcRenderer.invoke('eliminar', id),
  importarDialogo: () => ipcRenderer.invoke('importar-dialogo'),
  importarArchivos: (files) => ipcRenderer.invoke('importar-rutas', [...files].map((f) => webUtils.getPathForFile(f))),
  abrirExterno: (id) => ipcRenderer.invoke('abrir-externo', id),
  abrirCarpetaDatos: () => ipcRenderer.invoke('abrir-carpeta-datos'),
  copiaSeguridad: () => ipcRenderer.invoke('copia-seguridad'),
});
