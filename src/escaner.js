// Escaneo directo con el escáner del PC usando WIA (Windows Image Acquisition), que viene con Windows
// y funciona con casi cualquier escáner o impresora multifunción.
//
// Se habla con el escáner sin abrir ninguna ventana de Windows: se elige el primer escáner, se pone en
// escala de grises a 200 ppp (suficiente para leer el albarán) y se guarda la hoja como JPG.
// Historia: con PowerShell + `windowsHide` la ventana de escaneo de Windows quedaba oculta, y con
// VBScript (wscript.exe) fallaba en PCs de empresa con Windows Script Host deshabilitado.
const { execFile } = require('child_process');

// GUID del formato JPEG en WIA
const FORMATO_JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}';

// Códigos de error de WIA que conviene explicar con palabras
const ERRORES_WIA = {
  '80210015': 'No se ha encontrado ningún escáner. Comprueba que está encendido y conectado al PC.',
  '80210006': 'El escáner está ocupado. Espera un momento y vuelve a intentarlo.',
  '80210003': 'No hay papel en el escáner. Coloca el albarán y vuelve a pulsar Escanear.',
  '80210002': 'El papel se ha atascado en el escáner.',
  '80210005': 'El escáner no está disponible (¿está apagado o en reposo?).',
  '8021000A': 'Se ha perdido la conexión con el escáner.',
  '80040154': 'Este Windows no tiene el servicio de escaneo (WIA) instalado.',
};

const disponible = process.platform === 'win32';

const SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  $gestor = New-Object -ComObject WIA.DeviceManager
  $info = $null
  foreach ($d in $gestor.DeviceInfos) { if ($d.Type -eq 1) { $info = $d; break } }  # 1 = escáner
  if ($info -eq $null) { [Console]::Error.WriteLine('80210015 sin escaner'); exit 1 }
  $item = $info.Connect().Items.Item(1)

  function Fijar($id, $valor) {
    foreach ($p in $item.Properties) { if ($p.PropertyID -eq $id) { try { $p.Value = $valor } catch {} } }
  }
  Fijar 6146 2    # escala de grises
  Fijar 6147 200  # ppp horizontal
  Fijar 6148 200  # ppp vertical

  $imagen = $item.Transfer('${FORMATO_JPEG}')
  if ($imagen.FormatID -ne '${FORMATO_JPEG}') {
    $proceso = New-Object -ComObject WIA.ImageProcess
    $proceso.Filters.Add($proceso.FilterInfos.Item('Convert').FilterID)
    $proceso.Filters.Item(1).Properties.Item('FormatID').Value = '${FORMATO_JPEG}'
    $proceso.Filters.Item(1).Properties.Item('Quality').Value = 90
    $imagen = $proceso.Apply($imagen)
  }
  $imagen.SaveFile($env:ALBARANES_DESTINO)
  exit 0
} catch {
  [Console]::Error.WriteLine(('{0:X8} {1}' -f $_.Exception.HResult, $_.Exception.Message))
  exit 1
}`;

// Escanea la hoja que hay en el escáner y la guarda en `destino` (.jpg). Devuelve true si se ha escaneado.
function escanearPagina(destino) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      { env: { ...process.env, ALBARANES_DESTINO: destino }, windowsHide: true, timeout: 180000 },
      (error, _stdout, stderr) => {
        if (!error) return resolve(true);
        const texto = String(stderr).trim();
        const codigo = (texto.match(/^([0-9A-F]{8})/m) || [])[1];
        if (ERRORES_WIA[codigo]) return reject(new Error(ERRORES_WIA[codigo]));
        if (error.killed) return reject(new Error('El escáner no ha respondido en 3 minutos.'));
        reject(new Error(`No se ha podido escanear: ${texto.split('\n').pop() || error.message}`));
      }
    );
  });
}

module.exports = { disponible, escanearPagina };
