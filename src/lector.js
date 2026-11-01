// Lectura automática de albaranes escaneados: separa el PDF en páginas,
// renderiza la cabecera de cada una y la pasa por OCR (Tesseract) para
// obtener el número de albarán y la fecha.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// En la app instalada estos módulos van fuera del .asar (ver "asarUnpack").
const sinAsar = (p) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

// Zona de la página donde está la cabecera "Número Albarán | Fecha" (en fracción de la página).
// Es generosa porque los escaneos pueden salir desplazados o torcidos.
const ZONA_CABECERA = { x: 0, y: 0.16, ancho: 0.7, alto: 0.33 };
const PPP_OCR = 200;
const ANCHO_MINIATURA = 260;

// Formatos de imagen que se aceptan además del PDF (se convierten a PDF antes de leerlos).
const EXT_IMAGEN = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];
const esImagen = (ruta) => EXT_IMAGEN.includes(path.extname(ruta).toLowerCase());

const CONFUSIONES = { l: '1', I: '1', i: '1', '|': '1', '!': '1', O: '0', o: '0', D: '0', S: '5', s: '5', B: '8', Z: '2', z: '2' };

function fechaValida(d, m, a) {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

// Saca número y fecha del texto reconocido. Devuelve { numero, fecha } con '' si no los encuentra.
function interpretarTexto(texto) {
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const iCabecera = lineas.findIndex((l) => /albar/i.test(l) && /fecha/i.test(l));
  const candidatas = iCabecera >= 0 ? lineas.slice(iCabecera + 1, iCabecera + 3) : lineas;

  let numero = '';
  let fecha = '';
  let fechasDistintas = false; // "Fecha" y "Fecha Valor" siempre coinciden; si no, algo se ha leído mal
  for (const linea of candidatas) {
    const fechas = [...linea.matchAll(/(\d{2})[/\-.](\d{2})[/\-.](\d{4})/g)]
      .filter((f) => fechaValida(+f[1], +f[2], +f[3]))
      .map((f) => `${f[3]}-${f[2]}-${f[1]}`);
    if (!fecha && fechas.length) {
      fecha = fechas[0];
      fechasDistintas = fechas.length > 1 && fechas[1] !== fechas[0];
    }
    if (!numero) {
      // Lo que va antes de la primera fecha (o de un trozo con aspecto de fecha) es el número.
      const corte = linea.search(/\d{2}[/\-.]\d/);
      const trozo = (corte >= 0 ? linea.slice(0, corte) : linea).replace(/[\s|,;:]+$/g, '');
      const m = trozo.match(/([A-Z]{1,3})\s*([0-9lIi|!OoDSsBZz][0-9lIi|!OoDSsBZz\s]{1,9})$/);
      if (m) {
        const cifras = m[2].replace(/\s/g, '').replace(/./g, (c) => CONFUSIONES[c] ?? c);
        if (/^\d+$/.test(cifras)) numero = m[1] + cifras;
      }
    }
    if (numero && fecha) break;
  }
  return { numero, fecha, fechasDistintas };
}

// Marca como dudosas las páginas sin número/fecha o con un número de cifras distinto al habitual.
// Lo habitual se saca del propio lote si tiene al menos 3 números; si no, de la biblioteca (`cifrasBiblioteca`).
function revisarLote(paginas, cifrasBiblioteca = 0) {
  const cifras = paginas.map((p) => (p.numero.match(/\d+$/) || [''])[0].length).filter(Boolean);
  const frecuencia = {};
  cifras.forEach((n) => (frecuencia[n] = (frecuencia[n] || 0) + 1));
  const habitual = cifras.length >= 3 ? Number(Object.keys(frecuencia).sort((a, b) => frecuencia[b] - frecuencia[a])[0]) : cifrasBiblioteca;
  const vistos = {};
  paginas.forEach((p) => (vistos[p.numero] = (vistos[p.numero] || 0) + 1));

  for (const p of paginas) {
    const avisos = [];
    if (!p.numero) avisos.push('No se ha podido leer el número');
    else if (habitual && (p.numero.match(/\d+$/) || [''])[0].length !== habitual) avisos.push('El número parece incompleto');
    if (!p.fecha) avisos.push('No se ha podido leer la fecha');
    else if (p.fechasDistintas) avisos.push('La fecha no coincide con la fecha valor');
    if (p.numero && vistos[p.numero] > 1) avisos.push('Número repetido en este PDF');
    p.avisos = avisos;
  }
  return paginas;
}

class Lector {
  constructor({ cacheDir, registro = () => {} } = {}) {
    this.cacheDir = cacheDir || os.tmpdir();
    this.registro = registro; // función opcional para diagnosticar problemas
    this.cifrasHabituales = 0; // nº de cifras típico de los albaranes ya guardados (lo pone quien usa el lector)
    this.worker = null;
  }

  async iniciar() {
    if (this.worker) return;
    this.registro('iniciando OCR');
    const { createWorker } = require('tesseract.js');
    const datos = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'));
    this.worker = await createWorker('eng', 1, {
      langPath: sinAsar(path.join(datos, '4.0.0_best_int')),
      workerPath: sinAsar(require.resolve('tesseract.js/src/worker-script/node/index.js')),
      corePath: sinAsar(path.dirname(require.resolve('tesseract.js-core/package.json'))),
      cachePath: this.cacheDir,
      gzip: true,
      logger: (m) => this.registro(`tesseract: ${m.status} ${m.progress ?? ''}`),
      errorHandler: (e) => this.registro(`tesseract error: ${e}`),
    });
    this.registro('OCR listo; cargando pdf.js');
    this.pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    this.registro('pdf.js listo; cargando canvas');
    this.canvas = require('@napi-rs/canvas');
    this.registro('canvas listo');
  }

  async terminar() {
    if (this.worker) await this.worker.terminate();
    this.worker = null;
  }

  // Convierte una imagen (foto o escaneo en JPG, PNG…) en un PDF de una página del ancho de un A4.
  async imagenAPdf(ruta) {
    await this.iniciar();
    const imagen = await this.canvas.loadImage(fs.readFileSync(ruta));
    const lienzo = this.canvas.createCanvas(imagen.width, imagen.height);
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff'; // las PNG con transparencia saldrían en negro
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(imagen, 0, 0);

    const doc = await PDFDocument.create();
    const jpg = await doc.embedJpg(lienzo.toBuffer('image/jpeg', 90));
    const ancho = 595; // A4 en puntos
    const alto = (ancho * imagen.height) / imagen.width;
    doc.addPage([ancho, alto]).drawImage(jpg, { x: 0, y: 0, width: ancho, height: alto });
    return Buffer.from(await doc.save());
  }

  // Lee un PDF o una imagen (de una o muchas páginas). Guarda cada página como PDF suelto en `carpetaTemporal`
  // y devuelve, por página: { pagina, archivo, numero, fecha, miniatura, avisos }.
  async procesar(ruta, carpetaTemporal, alProgresar = () => {}) {
    await this.iniciar();
    const bytes = esImagen(ruta) ? await this.imagenAPdf(ruta) : fs.readFileSync(ruta);
    const original = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const documento = await this.pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
    const total = original.getPageCount();
    fs.mkdirSync(carpetaTemporal, { recursive: true });

    const paginas = [];
    for (let i = 0; i < total; i++) {
      alProgresar({ pagina: i + 1, total });
      this.registro(`página ${i + 1} de ${total}`);

      const suelto = await PDFDocument.create();
      const [copia] = await suelto.copyPages(original, [i]);
      suelto.addPage(copia);
      const archivo = path.join(carpetaTemporal, `pagina-${String(i + 1).padStart(3, '0')}.pdf`);
      fs.writeFileSync(archivo, await suelto.save());

      const { recorte, completa, miniatura } = await this.renderizar(await documento.getPage(i + 1));
      let texto = (await this.worker.recognize(recorte)).data.text;
      let leido = interpretarTexto(texto);
      if (!leido.numero || !leido.fecha) {
        // Fotos recortadas o escaneos muy desplazados: se lee la página entera y se completa lo que falte.
        this.registro(`página ${i + 1}: leyendo la página completa`);
        const textoCompleto = (await this.worker.recognize(completa)).data.text;
        const otro = interpretarTexto(textoCompleto);
        leido = leido.fecha ? { ...leido, numero: leido.numero || otro.numero } : { ...otro, numero: leido.numero || otro.numero };
        texto += '\n' + textoCompleto;
      }
      paginas.push({ pagina: i + 1, archivo, miniatura, texto, ...leido });
    }
    await documento.destroy();
    return revisarLote(paginas, this.cifrasHabituales);
  }

  async renderizar(pagina) {
    const escala = PPP_OCR / 72;
    const vista = pagina.getViewport({ scale: escala });
    const lienzo = this.canvas.createCanvas(Math.ceil(vista.width), Math.ceil(vista.height));
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pagina.render({ canvasContext: ctx, canvas: lienzo, viewport: vista }).promise;

    const z = ZONA_CABECERA;
    const [x, y, w, h] = [z.x * lienzo.width, z.y * lienzo.height, z.ancho * lienzo.width, z.alto * lienzo.height].map(Math.round);
    const zona = this.canvas.createCanvas(w, h);
    zona.getContext('2d').drawImage(lienzo, x, y, w, h, 0, 0, w, h);

    const altoMini = Math.round((ANCHO_MINIATURA * lienzo.height) / lienzo.width);
    const mini = this.canvas.createCanvas(ANCHO_MINIATURA, altoMini);
    mini.getContext('2d').drawImage(lienzo, 0, 0, lienzo.width, lienzo.height, 0, 0, ANCHO_MINIATURA, altoMini);

    pagina.cleanup();
    return {
      recorte: zona.toBuffer('image/png'),
      completa: lienzo.toBuffer('image/png'),
      miniatura: 'data:image/jpeg;base64,' + mini.toBuffer('image/jpeg', 80).toString('base64'),
    };
  }
}

module.exports = { Lector, interpretarTexto, revisarLote, esImagen, EXT_IMAGEN };
