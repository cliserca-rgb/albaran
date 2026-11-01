const $ = (sel) => document.querySelector(sel);
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const estado = {
  vista: 'lista',
  filtro: { anio: '', mes: '' }, // '' = todos
  abiertos: new Set(), // años desplegados en el menú
  seleccionado: null,
  lote: null, // { lote, paginas } mientras se revisa una importación
  ocupado: false,
};

// ---------- Utilidades ----------
function el(etiqueta, props = {}, ...hijos) {
  const e = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...hijos.flat().filter((h) => h !== null && h !== undefined && h !== false));
  return e;
}
const icono = (nombre) => el('span', { dataset: { icono: nombre } });

function formatoFecha(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

const albaranes = (n) => `${n} ${n === 1 ? 'albarán' : 'albaranes'}`;

function carpetaDe(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return 'Sin fecha';
  const [a, m] = fecha.split('-');
  return `${a} / ${m} - ${MESES[Number(m) - 1]}`;
}

function mensajeError(e) {
  return String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

function avisar(texto, tipo = 'ok') {
  const a = el('div', { class: `aviso ${tipo}` }, icono(tipo === 'error' ? 'alerta' : 'check'), el('span', {}, texto));
  $('#avisos').append(a);
  pintarIconos(a);
  setTimeout(() => {
    a.classList.add('saliendo');
    setTimeout(() => a.remove(), 200);
  }, tipo === 'error' ? 6000 : 3500);
}

function mostrarVista(nombre) {
  estado.vista = nombre;
  for (const v of ['lista', 'procesando', 'revision', 'faltantes', 'detalle']) $(`#vista-${v}`).hidden = v !== nombre;
  document.querySelectorAll('.lateral .nav').forEach((b) => b.classList.remove('activo'));
  if (nombre === 'faltantes') $('.nav[data-ir=faltantes]').classList.add('activo');
  if (nombre === 'lista') marcarFiltroActivo();
}

// ---------- Menú lateral: meses ----------
async function cargarArbol() {
  const { total, sinFecha, anios } = await window.api.arbol();
  $('#cuenta-total').textContent = total || '';
  const cont = $('#arbol');
  cont.replaceChildren();
  if (!estado.abiertos.size && anios[0]) estado.abiertos.add(anios[0].anio);

  for (const a of anios) {
    const abierto = estado.abiertos.has(a.anio);
    cont.append(
      el('button', {
        class: `nav anio ${abierto ? 'abierto' : ''}`,
        dataset: { anio: a.anio, mes: '' },
        onclick: () => {
          estado.abiertos.has(a.anio) ? estado.abiertos.delete(a.anio) : estado.abiertos.add(a.anio);
          filtrar(a.anio, '');
        },
      }, el('span', { class: 'chevron', dataset: { icono: 'chevron' } }), a.anio, el('span', { class: 'cuenta' }, String(a.n)))
    );
    if (abierto) {
      for (const m of a.meses) {
        cont.append(
          el('button', { class: 'nav mes', dataset: { anio: a.anio, mes: m.mes }, onclick: () => filtrar(a.anio, m.mes) },
            m.nombre, el('span', { class: 'cuenta' }, String(m.n)))
        );
      }
    }
  }
  if (sinFecha) {
    cont.append(el('button', { class: 'nav', dataset: { anio: 'Sin fecha', mes: '' }, onclick: () => filtrar('Sin fecha', '') },
      icono('alerta'), 'Sin fecha', el('span', { class: 'cuenta' }, String(sinFecha))));
  }
  $('#arbol-vacio').hidden = anios.length > 0 || sinFecha > 0;
  pintarIconos(cont);
  marcarFiltroActivo();
}

function marcarFiltroActivo() {
  if (estado.vista !== 'lista') return;
  const { anio, mes } = estado.filtro;
  document.querySelectorAll('.lateral .nav').forEach((b) => b.classList.remove('activo'));
  if (!anio) $('.nav[data-ir=todos]').classList.add('activo');
  document.querySelectorAll('#arbol .nav').forEach((b) => b.classList.toggle('activo', b.dataset.anio === anio && b.dataset.mes === mes));
}

function filtrar(anio, mes) {
  estado.filtro = { anio, mes };
  mostrarVista('lista');
  cargarArbol();
  cargarLista();
}

// ---------- Lista ----------
async function cargarLista() {
  const { anio, mes } = estado.filtro;
  const busqueda = $('#busqueda').value;
  const filas = await window.api.listar({ busqueda, anio, mes });

  $('#titulo-lista').textContent = !anio ? 'Todos los albaranes' : anio === 'Sin fecha' ? 'Albaranes sin fecha' : mes ? `${MESES[Number(mes) - 1]} ${anio}` : `Año ${anio}`;
  $('#subtitulo-lista').textContent = albaranes(filas.length);

  const cont = $('#filas');
  cont.replaceChildren(
    ...filas.map((f) =>
      el('div', { class: 'fila', onclick: () => abrirDetalle(f.id) },
        el('span', { class: 'miniatura' }, icono('pdf')),
        el('span', { class: 'principal-celda' }, f.numero),
        el('span', { class: 'celda' }, formatoFecha(f.fecha) || el('span', { class: 'vacio' }, '—')),
        el('span', { class: 'celda etiqueta-mes' }, icono('carpeta'), carpetaDe(f.fecha)),
        el('span', { class: 'celda secundario' }, f.origen ? `${f.origen}${f.pagina ? ` · pág. ${f.pagina}` : ''}` : ''),
        el('span', { class: 'celda secundario' }, f.notas || '')
      )
    )
  );
  pintarIconos(cont);

  const hayFiltro = busqueda !== '' || anio !== '';
  $('#tabla').hidden = filas.length === 0;
  $('#zona-vacia').hidden = filas.length > 0 || hayFiltro;
  $('#sin-resultados').hidden = filas.length > 0 || !hayFiltro;
}

// ---------- Importar ----------
async function importar(rutas) {
  if (estado.ocupado || !rutas.length) return;
  estado.ocupado = true;
  $('#progreso-texto').textContent = 'Preparando…';
  $('#progreso-barra').style.width = '0';
  mostrarVista('procesando');
  try {
    const r = await window.api.procesar(rutas);
    if (r.errores.length) avisar('No se pudo leer:\n' + r.errores.join('\n'), 'error');
    if (!r.paginas.length) {
      await window.api.descartarLote(r.lote);
      filtrar(estado.filtro.anio, estado.filtro.mes);
      return;
    }
    estado.lote = r;
    for (const p of r.paginas) {
      p.incluir = !p.yaExiste;
      p.sospechoso = p.avisos.includes('El número parece incompleto');
    }
    pintarRevision();
    mostrarVista('revision');
  } catch (e) {
    avisar(mensajeError(e), 'error');
    mostrarVista('lista');
  } finally {
    estado.ocupado = false;
  }
}

window.api.alProgresar(({ nombre, pagina, total, archivo, archivos }) => {
  $('#progreso-texto').textContent = `Página ${pagina} de ${total}` + (archivos > 1 ? ` · archivo ${archivo} de ${archivos}` : ` · ${nombre}`);
  $('#progreso-barra').style.width = `${(((archivo - 1) + pagina / total) / archivos) * 100}%`;
});

// Recalcula los avisos de cada página según lo que el usuario va corrigiendo.
function avisosDe(p, repetidos) {
  const avisos = [];
  if (!p.numero.trim()) avisos.push('Falta el número');
  else if (p.sospechoso) avisos.push('El número parece incompleto: compruébalo en la imagen');
  if (!p.fecha) avisos.push('Falta la fecha: se guardará en «Sin fecha»');
  if (p.numero && repetidos.has(p.numero.trim().toUpperCase())) avisos.push('Este número está repetido en este PDF');
  if (p.yaExiste) avisos.push('Ya está guardado en la biblioteca');
  return avisos;
}

function pintarRevision() {
  const paginas = estado.lote.paginas;
  const cont = $('#rejilla');
  cont.replaceChildren(...paginas.map((p, i) => cartaRevision(p, i)));
  pintarIconos(cont);
  actualizarResumen();
}

function cartaRevision(p, i) {
  const numero = el('input', { name: 'numero', value: p.numero, placeholder: 'Ej. A1050', class: p.sospechoso ? 'sospechoso' : '' });
  const fecha = el('input', { name: 'fecha', type: 'date', value: p.fecha });
  const destino = el('span');
  const avisos = el('div');
  const incluir = el('input', { type: 'checkbox' });
  incluir.checked = p.incluir;

  const carta = el('div', { class: 'carta', dataset: { i } },
    el('button', { class: 'carta-imagen', type: 'button', title: 'Ver en grande', onclick: () => abrirModal(p) },
      el('img', { src: p.miniatura, alt: `Página ${p.pagina}` }),
      el('span', { class: 'pagina' }, `Página ${p.pagina}`)),
    el('div', { class: 'carta-cuerpo' },
      el('div', { class: 'dos' },
        el('label', { class: 'campo' }, el('span', { class: 'etiqueta-campo' }, 'Número'), numero),
        el('label', { class: 'campo' }, el('span', { class: 'etiqueta-campo' }, 'Fecha'), fecha)),
      el('div', { class: 'carta-destino' }, icono('carpeta'), destino),
      avisos,
      el('label', { class: 'carta-incluir' }, incluir, 'Guardar este albarán'))
  );

  let espera;
  numero.addEventListener('input', () => {
    p.numero = numero.value.toUpperCase();
    p.sospechoso = false;
    numero.classList.remove('sospechoso');
    clearTimeout(espera);
    espera = setTimeout(async () => {
      p.yaExiste = !!p.numero.trim() && (await window.api.existe(p.numero.trim()));
      p.incluir = !p.yaExiste && !!p.numero.trim();
      incluir.checked = p.incluir;
      actualizarResumen();
    }, 300);
    actualizarResumen();
  });
  numero.addEventListener('blur', () => (numero.value = p.numero));
  fecha.addEventListener('input', () => {
    p.fecha = fecha.value;
    actualizarResumen();
  });
  incluir.addEventListener('change', () => {
    p.incluir = incluir.checked;
    actualizarResumen();
  });

  p.pintar = () => {
    destino.textContent = carpetaDe(p.fecha);
    avisos.replaceChildren(...p.avisosActuales.map((a) => el('div', { class: 'carta-aviso' }, icono('alerta'), a)));
    pintarIconos(avisos);
    carta.classList.toggle('dudosa', p.incluir && p.avisosActuales.some((a) => !a.startsWith('Ya está')));
    carta.classList.toggle('omitida', !p.incluir);
  };
  return carta;
}

function actualizarResumen() {
  const paginas = estado.lote.paginas;
  const cuenta = {};
  paginas.filter((p) => p.incluir).forEach((p) => {
    const n = p.numero.trim().toUpperCase();
    if (n) cuenta[n] = (cuenta[n] || 0) + 1;
  });
  const repetidos = new Set(Object.keys(cuenta).filter((n) => cuenta[n] > 1));
  for (const p of paginas) {
    p.avisosActuales = avisosDe(p, repetidos);
    p.pintar?.();
  }

  const aGuardar = paginas.filter((p) => p.incluir);
  const dudosas = aGuardar.filter((p) => p.avisosActuales.length);
  const bloqueantes = aGuardar.filter((p) => !p.numero.trim() || repetidos.has(p.numero.trim().toUpperCase()));
  const yaEstan = paginas.filter((p) => p.yaExiste).length;

  $('#resumen-revision').replaceChildren(
    ...[
      el('span', { class: 'insignia revisado' }, `${aGuardar.length - dudosas.length} correctos`),
      dudosas.length && el('span', { class: 'insignia pendiente' }, `${dudosas.length} para revisar`),
      yaEstan && el('span', { class: 'insignia recibido' }, `${yaEstan} ya guardados`),
    ].filter(Boolean)
  );
  $('#txt-guardar-lote').textContent = `Guardar ${albaranes(aGuardar.length)}`;
  $('#btn-guardar-lote').disabled = aGuardar.length === 0 || bloqueantes.length > 0;
  $('#pie-texto').textContent = bloqueantes.length
    ? 'Corrige los números vacíos o repetidos (o desmarca esos albaranes) para poder guardar.'
    : dudosas.length
      ? 'Hay albaranes marcados en amarillo: revísalos antes de guardar.'
      : 'Todo listo.';
}

async function guardarLote() {
  const { lote, paginas } = estado.lote;
  const elegidas = paginas
    .filter((p) => p.incluir)
    .map(({ archivo, numero, fecha, origen, pagina, texto }) => ({ archivo, numero: numero.trim(), fecha, origen, pagina, texto }));
  try {
    const { guardados, omitidos } = await window.api.guardarLote(lote, elegidas);
    estado.lote = null;
    avisar(`${albaranes(guardados.length)} guardado${guardados.length === 1 ? '' : 's'} en sus carpetas`);
    if (omitidos.length) avisar('No se guardaron:\n' + omitidos.map((o) => `${o.numero || 'pág. ' + o.pagina}: ${o.motivo}`).join('\n'), 'error');
    const ultimo = guardados.find((g) => g.fecha);
    if (ultimo) estado.abiertos.add(ultimo.fecha.slice(0, 4));
    filtrar('', '');
  } catch (e) {
    avisar(mensajeError(e), 'error');
  }
}

async function cancelarLote() {
  if (!confirm('¿Descartar esta importación? No se guardará ningún albarán.')) return;
  await window.api.descartarLote(estado.lote.lote);
  estado.lote = null;
  filtrar(estado.filtro.anio, estado.filtro.mes);
}

function abrirModal(p) {
  $('#modal-titulo').textContent = `Página ${p.pagina} · ${p.origen}`;
  $('#modal-visor').src = p.url;
  $('#modal').hidden = false;
}
function cerrarModal() {
  $('#modal').hidden = true;
  $('#modal-visor').src = 'about:blank';
}

// ---------- Faltantes ----------
async function comprobarFaltantes(e) {
  e.preventDefault();
  const datos = new FormData(e.target);
  try {
    const r = await window.api.faltantes(datos.get('desde'), datos.get('hasta'));
    $('#f-total').textContent = r.total;
    $('#f-encontrados').textContent = r.encontrados;
    $('#f-faltan').textContent = r.faltan.length;
    $('#f-titulo').textContent = r.faltan.length ? `Faltan entre ${r.desde} y ${r.hasta}` : `Del ${r.desde} al ${r.hasta}`;
    $('#f-tramos').replaceChildren(
      ...(r.faltan.length
        ? r.tramos.map((t) => el('span', { class: 'tramo' }, t))
        : [el('div', { class: 'todo-bien' }, icono('check'), 'No falta ninguno. ¡Están todos!')])
    );
    pintarIconos($('#f-tramos'));
    $('#btn-copiar-faltantes').hidden = !r.faltan.length;
    $('#btn-copiar-faltantes').onclick = async () => {
      await navigator.clipboard.writeText(r.faltan.join('\n'));
      avisar('Lista copiada. Puedes pegarla en un correo o en Excel.');
    };
    $('#resultado-faltantes').hidden = false;
  } catch (err) {
    avisar(mensajeError(err), 'error');
  }
}

// ---------- Detalle ----------
async function abrirDetalle(id) {
  const f = await window.api.obtener(id);
  if (!f) return cargarLista();
  estado.seleccionado = f;
  $('#titulo-detalle').textContent = `Albarán ${f.numero}`;
  $('#subtitulo-detalle').textContent = formatoFecha(f.fecha) || 'Sin fecha';
  if ($('#visor').dataset.url !== f.url) {
    $('#visor').src = f.url;
    $('#visor').dataset.url = f.url;
  }
  const form = $('#formulario');
  for (const c of ['numero', 'fecha', 'notas']) form.elements[c].value = f[c] ?? '';
  pintarDestino();
  $('#archivo-info').textContent = `Archivo: ${f.archivo}` + (f.origen ? `\nEscaneo original: ${f.origen}${f.pagina ? `, página ${f.pagina}` : ''}` : '');
  $('#aviso-cambios').hidden = true;
  mostrarVista('detalle');
}

function pintarDestino() {
  const form = $('#formulario');
  const numero = form.elements.numero.value.trim().toUpperCase() || '…';
  $('#destino-detalle').replaceChildren(icono('carpeta'), `${carpetaDe(form.elements.fecha.value)} / ${numero}.pdf`);
  pintarIconos($('#destino-detalle'));
}

async function guardarDetalle(e) {
  e.preventDefault();
  try {
    const f = await window.api.actualizar(estado.seleccionado.id, Object.fromEntries(new FormData(e.target)));
    avisar(f.archivo !== estado.seleccionado.archivo ? `Guardado y movido a ${carpetaDe(f.fecha)}` : 'Cambios guardados');
    await abrirDetalle(f.id);
    cargarArbol();
  } catch (err) {
    avisar(mensajeError(err), 'error');
  }
}

// ---------- Eventos ----------
const pedirPdf = async () => importar(await window.api.elegirPdf());
$('#btn-importar-lateral').addEventListener('click', pedirPdf);
$('#zona-vacia').addEventListener('click', pedirPdf);
$('.nav[data-ir=todos]').addEventListener('click', () => filtrar('', ''));
$('.nav[data-ir=faltantes]').addEventListener('click', () => mostrarVista('faltantes'));
$('#busqueda').addEventListener('input', cargarLista);
$('#btn-carpeta').addEventListener('click', () => window.api.abrirCarpetaDatos());
$('#btn-copia').addEventListener('click', async () => {
  try {
    const carpeta = await window.api.copiaSeguridad();
    if (carpeta) avisar(`Copia de seguridad guardada en:\n${carpeta}`);
  } catch (e) {
    avisar(mensajeError(e), 'error');
  }
});

$('#btn-guardar-lote').addEventListener('click', guardarLote);
$('#btn-cancelar-lote').addEventListener('click', cancelarLote);
$('#modal-cerrar').addEventListener('click', cerrarModal);
$('#modal').addEventListener('click', (e) => e.target === e.currentTarget && cerrarModal());
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#modal').hidden && cerrarModal());

$('#form-faltantes').addEventListener('submit', comprobarFaltantes);

$('#formulario').addEventListener('submit', guardarDetalle);
$('#formulario').addEventListener('input', () => {
  $('#aviso-cambios').hidden = false;
  pintarDestino();
});
$('#btn-volver').addEventListener('click', () => filtrar(estado.filtro.anio, estado.filtro.mes));
$('#btn-externo').addEventListener('click', () => window.api.abrirExterno(estado.seleccionado.id));
$('#btn-en-carpeta').addEventListener('click', () => window.api.mostrarEnCarpeta(estado.seleccionado.id));
$('#btn-eliminar').addEventListener('click', async () => {
  if (await window.api.eliminar(estado.seleccionado.id)) {
    avisar('Albarán eliminado');
    filtrar(estado.filtro.anio, estado.filtro.mes);
  }
});

// Arrastrar y soltar un PDF en cualquier parte de la ventana
let arrastres = 0;
const puedeSoltar = () => !estado.ocupado && estado.vista !== 'revision';
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (!puedeSoltar()) return;
  arrastres++;
  $('#soltar').hidden = false;
});
window.addEventListener('dragleave', () => {
  if (--arrastres <= 0) {
    arrastres = 0;
    $('#soltar').hidden = true;
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  arrastres = 0;
  $('#soltar').hidden = true;
  if (puedeSoltar() && e.dataTransfer.files.length) importar(window.api.rutasDe(e.dataTransfer.files));
});

pintarIconos();
cargarArbol();
cargarLista();
