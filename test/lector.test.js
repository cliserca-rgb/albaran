const test = require('node:test');
const assert = require('node:assert');
const { interpretarTexto, revisarLote } = require('../src/lector');

// Textos reales devueltos por el OCR con los escaneos de ejemplo del cliente.
test('lee número y fecha de la cabecera', () => {
  const t = 'marc & chloe\nNumero Albaran, Fecha Fecha Valor | Referéncia Albaran\nA1223 | 26/10/2026 26/10/2026\nDescripcion';
  assert.deepEqual(interpretarTexto(t), { numero: 'A1223', fecha: '2026-10-26', fechasDistintas: false });
});

test('corrige letras confundidas con cifras', () => {
  const t = 'Numero Albarén, Fecha | Fecha Valor | Referéncia Albaran |\nAl 131 30/09/2026 30/09/2026 | i';
  assert.deepEqual(interpretarTexto(t), { numero: 'A1131', fecha: '2026-09-30', fechasDistintas: false });
});

test('si la primera fecha sale mal, usa la fecha valor', () => {
  const t = 'Numero Albaran, Fecha Focha Valor | Reforéncia AlbarAn\nA153 | 06/1022026 | 06/10/2026';
  assert.deepEqual(interpretarTexto(t), { numero: 'A153', fecha: '2026-10-06', fechasDistintas: false });
});

test('no inventa datos si no los encuentra', () => {
  assert.deepEqual(interpretarTexto('texto ilegible\n###'), { numero: '', fecha: '', fechasDistintas: false });
  assert.deepEqual(interpretarTexto('Numero Albaran Fecha\nA1200 | 31/02/2026').fecha, '');
});

test('marca como dudosos los números con cifras de menos, vacíos o repetidos', () => {
  const lote = revisarLote([
    { numero: 'A1223', fecha: '2026-10-26' },
    { numero: 'A1231', fecha: '2026-10-28' },
    { numero: 'A153', fecha: '2026-10-06' },
    { numero: 'A1197', fecha: '' },
    { numero: '', fecha: '2026-10-19' },
    { numero: 'A1231', fecha: '2026-10-28' },
  ]);
  assert.deepEqual(lote.map((p) => p.avisos), [
    [],
    ['Número repetido en este PDF'],
    ['El número parece incompleto'],
    ['No se ha podido leer la fecha'],
    ['No se ha podido leer el número'],
    ['Número repetido en este PDF'],
  ]);
});

test('con pocas páginas, compara con las cifras habituales de la biblioteca', () => {
  assert.deepEqual(revisarLote([{ numero: 'A050', fecha: '2026-09-09' }], 4)[0].avisos, ['El número parece incompleto']);
  assert.deepEqual(revisarLote([{ numero: 'A1050', fecha: '2026-09-09' }], 4)[0].avisos, []);
  assert.deepEqual(revisarLote([{ numero: 'A050', fecha: '2026-09-09' }], 0)[0].avisos, [], 'biblioteca vacía: no hay con qué comparar');
});

test('avisa si la fecha y la fecha valor no coinciden (lectura dudosa)', () => {
  const t = 'Numero Albagan, Fecha Fecha Valor | Referéncia Albaran\nA050 05/08/2026 i 09/09/2026';
  assert.deepEqual(interpretarTexto(t), { numero: 'A050', fecha: '2026-08-05', fechasDistintas: true });
  assert.deepEqual(revisarLote([interpretarTexto(t)], 4)[0].avisos, ['El número parece incompleto', 'La fecha no coincide con la fecha valor']);
});
