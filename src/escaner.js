// Escaneo directo con el escáner del PC usando WIA (Windows Image Acquisition), que viene con Windows
// y funciona con casi cualquier escáner o impresora multifunción. Se abre la ventana estándar de Windows
// para escanear y la página se guarda como JPG.
const { execFile } = require('child_process');

// GUID del formato JPEG en WIA
const FORMATO_JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}';

// Códigos de error de WIA que conviene explicar con palabras
const ERRORES_WIA = {
  '80210015': 'No se ha encontrado ningún escáner. Comprueba que está encendido y conectado al PC.',
  '80210006': 'El escáner está ocupado. Espera un momento y vuelve a intentarlo.',
  '80210003': 'No hay papel en el alimentador del escáner.',
  '80210002': 'El papel se ha atascado en el escáner.',
  '80210005': 'El escáner no está disponible (¿está apagado o en reposo?).',
  '8021000A': 'Se ha perdido la conexión con el escáner.',
};

const disponible = process.platform === 'win32';

// Escanea una página y la guarda en `destino` (.jpg). Devuelve true si se ha escaneado y false si el usuario cancela.
function escanearPagina(destino) {
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $dialogo = New-Object -ComObject WIA.CommonDialog
  # 1 = escáner, 2 = escala de grises, 131072 = máxima calidad
  $imagen = $dialogo.ShowAcquireImage(1, 2, 131072, '${FORMATO_JPEG}', $false, $true, $false)
  if ($imagen -eq $null) { exit 2 }
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
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env: { ...process.env, ALBARANES_DESTINO: destino }, windowsHide: true },
      (error, _stdout, stderr) => {
        if (!error) return resolve(true);
        if (error.code === 2) return resolve(false);
        const codigo = (String(stderr).match(/^([0-9A-F]{8})/m) || [])[1];
        reject(new Error(ERRORES_WIA[codigo] || `No se ha podido escanear: ${String(stderr).trim() || error.message}`));
      }
    );
  });
}

module.exports = { disponible, escanearPagina };
