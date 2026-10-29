// Genera test/ejemplos/ejemplo.pdf: 2 páginas escaneadas (imagen, sin texto) con un albarán inventado
// del mismo formato que los reales. Sirve para las pruebas sin usar datos de clientes.
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { PDFDocument } = require('pdf-lib');

function pagina(numero, fecha) {
  const c = createCanvas(1654, 2339); // A4 a 200 ppp
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000';
  g.strokeStyle = '#000';
  g.lineWidth = 3;
  g.font = 'italic bold 34px serif';
  g.fillText('empresa de ejemplo, S.L.', 120, 120);
  g.font = 'bold 46px sans-serif';
  g.fillText('ALBARÁN', 900, 120);
  g.font = '30px sans-serif';
  g.fillText('C/ Inventada, 1 - 35000 Ciudad', 120, 190);
  g.strokeRect(100, 520, 1000, 130);
  g.font = 'bold 30px sans-serif';
  g.fillText('Número Albarán', 120, 565);
  g.fillText('Fecha', 400, 565);
  g.fillText('Fecha Valor', 620, 565);
  g.font = '32px sans-serif';
  g.fillText(numero, 230, 625);
  g.fillText(fecha, 400, 625);
  g.fillText(fecha, 620, 625);
  g.strokeRect(100, 700, 1450, 900);
  g.fillText('Cantidad    Código    Artículo', 120, 750);
  return c.toBuffer('image/png');
}

(async () => {
  const doc = await PDFDocument.create();
  for (const [n, f] of [['A1050', '09/09/2026'], ['A1052', '14/10/2026']]) {
    const img = await doc.embedPng(pagina(n, f));
    doc.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  }
  const destino = path.join(__dirname, '..', 'test', 'ejemplos', 'ejemplo.pdf');
  fs.writeFileSync(destino, await doc.save());
  console.log('Creado', destino);
})();
