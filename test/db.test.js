const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Biblioteca, carpetaMes } = require('../src/db');

function carpetaTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'albaran-test-'));
}

function pagina(dir, nombre, numero, fecha) {
  const archivo = path.join(dir, nombre);
  fs.writeFileSync(archivo, '%PDF-1.4\n%%EOF\n');
  return { archivo, numero, fecha, origen: 'escaneo.pdf', pagina: 1 };
}

test('carpetas por mes', () => {
  assert.equal(carpetaMes('2026-09-09'), path.join('2026', '09 - Septiembre'));
  assert.equal(carpetaMes(''), 'Sin fecha');
});

test('guarda cada albarán con su número en la carpeta de su mes', async () => {
  const raiz = carpetaTemporal();
  const tmp = carpetaTemporal();
  const bib = await Biblioteca.abrir(raiz);

  const { guardados, omitidos } = bib.guardarLote([
    pagina(tmp, 'p1.pdf', 'a1050', '2026-09-09'),
    pagina(tmp, 'p2.pdf', 'A1223', '2026-10-26'),
    pagina(tmp, 'p3.pdf', '', '2026-10-26'),
    pagina(tmp, 'p4.pdf', 'A1050', '2026-09-10'),
  ]);
  assert.deepEqual(guardados.map((g) => g.numero), ['A1050', 'A1223']);
  assert.deepEqual(omitidos.map((o) => o.motivo), ['Sin número', 'El albarán A1050 ya está guardado']);
  assert.ok(fs.existsSync(path.join(raiz, '2026', '09 - Septiembre', 'A1050.pdf')));
  assert.ok(fs.existsSync(path.join(raiz, '2026', '10 - Octubre', 'A1223.pdf')));
  assert.ok(!fs.existsSync(path.join(tmp, 'p1.pdf')), 'el temporal se mueve, no se copia');

  assert.deepEqual(bib.arbol(), {
    total: 2,
    sinFecha: 0,
    anios: [{ anio: '2026', n: 2, meses: [{ mes: '10', nombre: 'Octubre', n: 1 }, { mes: '09', nombre: 'Septiembre', n: 1 }] }],
  });
  assert.deepEqual(bib.listar({ anio: '2026', mes: '09' }).map((f) => f.numero), ['A1050']);
  assert.deepEqual(bib.listar({ busqueda: '1223' }).map((f) => f.numero), ['A1223']);

  // Al reabrir, los datos siguen ahí
  const reabierta = await Biblioteca.abrir(raiz);
  assert.equal(reabierta.listar().length, 2);
});

test('al corregir número o fecha, el PDF se renombra y cambia de carpeta', async () => {
  const raiz = carpetaTemporal();
  const bib = await Biblioteca.abrir(raiz);
  const tmp = carpetaTemporal();
  const [a] = bib.guardarLote([pagina(tmp, 'p.pdf', 'A153', '2026-10-06')]).guardados;
  bib.guardarLote([pagina(tmp, 'q.pdf', 'A1150', '2026-10-06')]);

  const b = bib.actualizar(a.id, { numero: 'A1153', fecha: '2026-09-30', notas: 'corregido' });
  assert.equal(b.archivo, path.join('2026', '09 - Septiembre', 'A1153.pdf'));
  assert.ok(fs.existsSync(path.join(raiz, b.archivo)));
  assert.ok(!fs.existsSync(path.join(raiz, '2026', '10 - Octubre', 'A153.pdf')));

  assert.throws(() => bib.actualizar(a.id, { numero: 'A1150' }), /Ya hay otro albarán/);
  assert.throws(() => bib.actualizar(a.id, { numero: ' ' }), /vacío/);

  assert.ok(bib.eliminar(b.id));
  assert.ok(!fs.existsSync(path.join(raiz, '2026', '09 - Septiembre')), 'la carpeta vacía se borra');
});

test('dice qué albaranes faltan en un intervalo', async () => {
  const bib = await Biblioteca.abrir(carpetaTemporal());
  const tmp = carpetaTemporal();
  bib.guardarLote(['A500', 'A501', 'A503', 'A507', 'A510', 'B502'].map((n, i) => pagina(tmp, `${i}.pdf`, n, '2026-09-01')));

  const r = bib.faltantes('a500', 'A510');
  assert.deepEqual(r.faltan, ['A502', 'A504', 'A505', 'A506', 'A508', 'A509']);
  assert.deepEqual(r.tramos, ['A502', 'A504 – A506', 'A508 – A509']);
  assert.equal(r.encontrados, 5);
  assert.equal(r.total, 11);

  assert.deepEqual(bib.faltantes('A510', 'A507').faltan, ['A508', 'A509'], 'acepta el intervalo al revés');
  assert.throws(() => bib.faltantes('A1', 'B9'), /misma letra/);
  assert.throws(() => bib.faltantes('hola', 'A9'), /por ejemplo/);
});

test('copia de seguridad', async () => {
  const raiz = carpetaTemporal();
  const bib = await Biblioteca.abrir(raiz);
  bib.guardarLote([pagina(carpetaTemporal(), 'p.pdf', 'A1', '2026-01-02')]);
  const copia = bib.copiaSeguridad(carpetaTemporal());
  assert.ok(fs.existsSync(path.join(copia, 'albaranes.db')));
  assert.ok(fs.existsSync(path.join(copia, '2026', '01 - Enero', 'A1.pdf')));
  assert.throws(() => bib.copiaSeguridad(raiz), /dentro de la propia biblioteca/);
});
