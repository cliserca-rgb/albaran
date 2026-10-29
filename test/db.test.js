const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Biblioteca } = require('../src/db');

function carpetaTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'albaran-test-'));
}

function pdfFalso(dir, nombre) {
  const ruta = path.join(dir, nombre);
  fs.writeFileSync(ruta, '%PDF-1.4\n%%EOF\n');
  return ruta;
}

test('importa, edita, busca, persiste y elimina albaranes', async () => {
  const datos = carpetaTemporal();
  const origen = carpetaTemporal();
  let bib = await Biblioteca.abrir(datos);

  const a = bib.importar(pdfFalso(origen, 'scan1.pdf'));
  assert.equal(a.nombre_original, 'scan1.pdf');
  assert.equal(a.estado, 'pendiente');
  assert.ok(fs.existsSync(bib.rutaArchivo(a)));

  bib.actualizar(a.id, { numero: 'A-100', empresa: 'Hierros López', importe: 123.45, campo_raro: 'x' });
  bib.importar(pdfFalso(origen, 'scan2.pdf'));
  assert.throws(() => bib.importar(path.join(origen, 'nota.txt')), /No es un PDF/);

  assert.equal(bib.listar().length, 2);
  assert.deepEqual(bib.listar({ busqueda: 'lópez' }).map((f) => f.numero), ['A-100']);
  assert.deepEqual(bib.listar({ busqueda: 'Hierros' }).map((f) => f.numero), ['A-100']);

  // Al reabrir, los datos siguen ahí
  bib = await Biblioteca.abrir(datos);
  const reabierto = bib.obtener(a.id);
  assert.equal(reabierto.importe, 123.45);
  assert.equal(reabierto.campo_raro, undefined);

  bib.actualizar(a.id, { importe: '' });
  assert.equal(bib.obtener(a.id).importe, null);

  const copia = bib.copiaSeguridad(carpetaTemporal());
  assert.ok(fs.existsSync(path.join(copia, 'albaranes.db')));

  assert.ok(bib.eliminar(a.id));
  assert.equal(bib.obtener(a.id), null);
  assert.ok(!fs.existsSync(bib.rutaArchivo(a)));
  assert.equal(bib.listar().length, 1);
});
