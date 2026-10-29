const $ = (sel) => document.querySelector(sel);
let seleccionado = null;

function formatoFecha(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function formatoImporte(n) {
  return n == null ? '' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

async function cargarLista() {
  const filas = await window.api.listar({ busqueda: $('#busqueda').value, estado: $('#filtro-estado').value });
  const ul = $('#lista');
  ul.replaceChildren();
  for (const f of filas) {
    const li = document.createElement('li');
    li.dataset.id = f.id;
    li.classList.toggle('activo', f.id === seleccionado);

    const titulo = document.createElement('div');
    titulo.className = 'titulo';
    titulo.textContent = f.numero ? `Nº ${f.numero}` : f.nombre_original;

    const sub = document.createElement('div');
    sub.className = 'sub';
    const izq = document.createElement('span');
    izq.textContent = [f.empresa, formatoFecha(f.fecha || f.subido), formatoImporte(f.importe)].filter(Boolean).join(' · ');
    const etiqueta = document.createElement('span');
    etiqueta.className = `etiqueta ${f.estado}`;
    etiqueta.textContent = f.estado;
    sub.append(izq, etiqueta);

    li.append(titulo, sub);
    li.addEventListener('click', () => seleccionar(f.id));
    ul.append(li);
  }
  $('#contador').textContent = `${filas.length} albarán${filas.length === 1 ? '' : 'es'}`;
  $('#vacio').hidden = filas.length > 0 || $('#busqueda').value !== '' || $('#filtro-estado').value !== '';
}

async function seleccionar(id) {
  const f = id && (await window.api.obtener(id));
  seleccionado = f ? f.id : null;
  $('#detalle').hidden = !f;
  $('#sin-seleccion').hidden = !!f;
  document.querySelectorAll('#lista li').forEach((li) => li.classList.toggle('activo', Number(li.dataset.id) === seleccionado));
  if (!f) return;

  if ($('#visor').dataset.url !== f.url) {
    $('#visor').src = f.url;
    $('#visor').dataset.url = f.url;
  }
  const form = $('#formulario');
  for (const campo of ['numero', 'fecha', 'empresa', 'importe', 'estado', 'notas']) {
    form.elements[campo].value = f[campo] ?? '';
  }
  $('#archivo-info').textContent = `Archivo: ${f.nombre_original} · ${(f.tamano / 1024).toFixed(0)} KB · subido el ${formatoFecha(f.subido)}`;
  $('#estado-guardado').textContent = '';
}

function mostrarResultadoImportacion({ importados, errores }) {
  if (errores.length) alert('Algunos archivos no se pudieron subir:\n\n' + errores.join('\n'));
  cargarLista().then(() => importados.length && seleccionar(importados[importados.length - 1].id));
}

$('#btn-subir').addEventListener('click', async () => mostrarResultadoImportacion(await window.api.importarDialogo()));
$('#busqueda').addEventListener('input', cargarLista);
$('#filtro-estado').addEventListener('change', cargarLista);
$('#btn-carpeta').addEventListener('click', () => window.api.abrirCarpetaDatos());
$('#btn-copia').addEventListener('click', async () => {
  const carpeta = await window.api.copiaSeguridad();
  if (carpeta) alert(`Copia de seguridad guardada en:\n${carpeta}`);
});

$('#formulario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cambios = Object.fromEntries(new FormData(e.target));
  cambios.importe = cambios.importe === '' ? '' : Number(cambios.importe);
  await window.api.actualizar(seleccionado, cambios);
  $('#estado-guardado').textContent = 'Guardado ✓';
  cargarLista();
});
$('#btn-externo').addEventListener('click', () => window.api.abrirExterno(seleccionado));
$('#btn-eliminar').addEventListener('click', async () => {
  if (await window.api.eliminar(seleccionado)) {
    seleccionar(null);
    cargarLista();
  }
});

// Arrastrar y soltar PDF en cualquier parte de la ventana
let arrastres = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); arrastres++; $('#soltar').hidden = false; });
window.addEventListener('dragleave', () => { if (--arrastres <= 0) { arrastres = 0; $('#soltar').hidden = true; } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  arrastres = 0;
  $('#soltar').hidden = true;
  if (e.dataTransfer.files.length) mostrarResultadoImportacion(await window.api.importarArchivos(e.dataTransfer.files));
});

cargarLista();
