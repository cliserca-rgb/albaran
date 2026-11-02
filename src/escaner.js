// Escaneo directo con el escáner del PC usando WIA (Windows Image Acquisition), que viene con Windows
// y funciona con casi cualquier escáner o impresora multifunción. Se abre la ventana estándar de Windows
// para escanear y la página se guarda como JPG.
//
// Se ejecuta con un VBScript en wscript.exe (el intérprete de Windows sin consola). No se usa PowerShell
// con `windowsHide`, porque esa opción oculta también la ventana del escáner y parecía que no pasaba nada.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
  '80040154': 'Este Windows no tiene el servicio de escaneo (WIA) instalado.',
};

const disponible = process.platform === 'win32';

// Argumentos: <archivo .jpg de salida> <archivo donde escribir el error, si lo hay>
// Sale con 0 si ha escaneado, 2 si se cancela y 1 si hay error.
const SCRIPT = `
On Error Resume Next
Dim salida, informe, dialogo, imagen, proceso
salida = WScript.Arguments(0)
informe = WScript.Arguments(1)

Set dialogo = CreateObject("WIA.CommonDialog")
If Err.Number <> 0 Then Fallo Err.Number, Err.Description
' 1 = escáner, 2 = escala de grises, 131072 = máxima calidad
Set imagen = dialogo.ShowAcquireImage(1, 2, 131072, "${FORMATO_JPEG}", False, True, False)
If Err.Number <> 0 Then Fallo Err.Number, Err.Description
If imagen Is Nothing Then WScript.Quit 2

If imagen.FormatID <> "${FORMATO_JPEG}" Then
  Set proceso = CreateObject("WIA.ImageProcess")
  proceso.Filters.Add proceso.FilterInfos("Convert").FilterID
  proceso.Filters(1).Properties("FormatID").Value = "${FORMATO_JPEG}"
  proceso.Filters(1).Properties("Quality").Value = 90
  Set imagen = proceso.Apply(imagen)
  If Err.Number <> 0 Then Fallo Err.Number, Err.Description
End If

imagen.SaveFile salida
If Err.Number <> 0 Then Fallo Err.Number, Err.Description
WScript.Quit 0

Sub Fallo(numero, descripcion)
  Dim fso, f
  Set fso = CreateObject("Scripting.FileSystemObject")
  Set f = fso.CreateTextFile(informe, True)
  f.WriteLine Right("00000000" & Hex(numero), 8) & " " & descripcion
  f.Close
  WScript.Quit 1
End Sub
`;

// Escanea una página y la guarda en `destino` (.jpg). Devuelve true si se ha escaneado y false si el usuario cancela.
function escanearPagina(destino) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'albaranes-wia-'));
  const script = path.join(carpeta, 'escanear.vbs');
  const informe = path.join(carpeta, 'error.txt');
  fs.writeFileSync(script, SCRIPT.replace(/\n/g, '\r\n'), 'latin1');

  return new Promise((resolve, reject) => {
    execFile('wscript.exe', ['//B', '//Nologo', script, destino, informe], (error) => {
      const detalle = fs.existsSync(informe) ? fs.readFileSync(informe, 'latin1').trim() : '';
      fs.rmSync(carpeta, { recursive: true, force: true });
      if (!error && fs.existsSync(destino)) return resolve(true);
      if (error && error.code === 2) return resolve(false);
      const codigo = (detalle.match(/^([0-9A-F]{8})/) || [])[1];
      reject(new Error(ERRORES_WIA[codigo] || `No se ha podido escanear. ${detalle || (error ? error.message : 'El escáner no ha devuelto ninguna imagen.')}`));
    });
  });
}

module.exports = { disponible, escanearPagina };
