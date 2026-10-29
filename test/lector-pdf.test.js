const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Lector } = require('../src/lector');

test('separa un PDF escaneado y lee número y fecha de cada página', { timeout: 120000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'albaran-lector-'));
  const lector = new Lector({ cacheDir: tmp });
  try {
    const paginas = await lector.procesar(path.join(__dirname, 'ejemplos', 'ejemplo.pdf'), path.join(tmp, 'paginas'));
    assert.deepEqual(paginas.map((p) => [p.numero, p.fecha]), [['A1050', '2026-09-09'], ['A1052', '2026-10-14']]);
    for (const p of paginas) {
      assert.ok(fs.existsSync(p.archivo));
      assert.match(p.miniatura, /^data:image\/jpeg;base64,/);
    }
  } finally {
    await lector.terminar();
  }
});
