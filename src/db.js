// Biblioteca de albaranes: los PDF se guardan como <raíz>/<año>/<MM - Mes>/<número>.pdf
// y un índice SQLite (sql.js) en <raíz>/albaranes.db permite buscarlos.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SIN_FECHA = 'Sin fecha';
const CAMPOS_EDITABLES = ['numero', 'fecha', 'notas'];

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS albaranes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  numero     TEXT    NOT NULL,
  fecha      TEXT    DEFAULT '',
  notas      TEXT    DEFAULT '',
  texto      TEXT    DEFAULT '',
  archivo    TEXT    NOT NULL,
  origen     TEXT    DEFAULT '',
  pagina     INTEGER,
  tamano     INTEGER NOT NULL,
  subido     TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS albaranes_numero ON albaranes (numero);`;

function carpetaMes(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return SIN_FECHA;
  const [anio, mes] = fecha.split('-');
  return path.join(anio, `${mes} - ${MESES[Number(mes) - 1]}`);
}

// "A1050" -> { prefijo: 'A', valor: 1050, cifras: 4 }
function partirNumero(numero) {
  const m = String(numero).trim().toUpperCase().match(/^([A-Z]*)\s*0*(\d+)$/);
  return m && { prefijo: m[1], valor: Number(m[2]), cifras: m[0].length - m[1].length };
}

function limpiarNumero(numero) {
  return String(numero || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[\\/:*?"<>|]/g, '-');
}

class Biblioteca {
  static async abrir(raiz) {
    const SQL = await initSqlJs({
      locateFile: (f) => require.resolve(`sql.js/dist/${f}`).replace('app.asar', 'app.asar.unpacked'),
    });
    fs.mkdirSync(raiz, { recursive: true });
    const dbPath = path.join(raiz, 'albaranes.db');
    const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
    db.exec(ESQUEMA);
    return new Biblioteca(raiz, dbPath, db);
  }

  constructor(raiz, dbPath, db) {
    this.raiz = raiz;
    this.dbPath = dbPath;
    this.db = db;
  }

  // Escritura atómica: se guarda en un temporal y se renombra, para no corromper el índice si se corta.
  guardar() {
    const tmp = this.dbPath + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.dbPath);
  }

  rutaArchivo(fila) {
    return path.join(this.raiz, fila.archivo);
  }

  consultar(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const filas = [];
    while (stmt.step()) filas.push(stmt.getAsObject());
    stmt.free();
    return filas;
  }

  existe(numero, excepto = -1) {
    return this.consultar('SELECT 1 FROM albaranes WHERE numero = ? AND id != ?', [limpiarNumero(numero), excepto]).length > 0;
  }

  // Mueve un PDF a la carpeta de su mes con el nombre <número>.pdf. Devuelve la ruta relativa a la raíz.
  colocar(origen, numero, fecha, mover) {
    const relativa = path.join(carpetaMes(fecha), `${numero}.pdf`);
    const destino = path.join(this.raiz, relativa);
    if (path.resolve(origen) === path.resolve(destino)) return relativa;
    if (fs.existsSync(destino)) throw new Error(`Ya existe el archivo ${relativa}`);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    if (mover) {
      try {
        fs.renameSync(origen, destino);
      } catch {
        fs.copyFileSync(origen, destino); // entre discos distintos no se puede renombrar
        fs.rmSync(origen, { force: true });
      }
    } else {
      fs.copyFileSync(origen, destino);
    }
    return relativa;
  }

  // Guarda las páginas revisadas: [{ archivo, numero, fecha, origen, pagina, texto }].
  // Las que no tienen número o ya existen se devuelven en `omitidos` con el motivo.
  guardarLote(paginas) {
    const guardados = [];
    const omitidos = [];
    for (const p of paginas) {
      const numero = limpiarNumero(p.numero);
      if (!numero) {
        omitidos.push({ ...p, motivo: 'Sin número' });
        continue;
      }
      if (this.existe(numero)) {
        omitidos.push({ ...p, motivo: `El albarán ${numero} ya está guardado` });
        continue;
      }
      const fecha = p.fecha || '';
      const archivo = this.colocar(p.archivo, numero, fecha, true);
      this.db.run(
        'INSERT INTO albaranes (numero, fecha, texto, archivo, origen, pagina, tamano, subido) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [numero, fecha, p.texto || '', archivo, p.origen || '', p.pagina ?? null, fs.statSync(path.join(this.raiz, archivo)).size, new Date().toISOString()]
      );
      guardados.push(this.consultar('SELECT * FROM albaranes WHERE id = last_insert_rowid()')[0]);
    }
    if (guardados.length) this.guardar();
    return { guardados, omitidos };
  }

  listar({ busqueda = '', anio = '', mes = '' } = {}) {
    const where = [];
    const params = [];
    if (busqueda.trim()) {
      const q = `%${busqueda.trim()}%`;
      where.push('(numero LIKE ? OR notas LIKE ? OR texto LIKE ? OR origen LIKE ?)');
      params.push(q, q, q, q);
    }
    if (anio === SIN_FECHA) {
      where.push("fecha = ''");
    } else if (anio) {
      where.push("substr(fecha, 1, 4) = ?");
      params.push(anio);
      if (mes) {
        where.push("substr(fecha, 6, 2) = ?");
        params.push(mes);
      }
    }
    const filas = this.consultar(`SELECT * FROM albaranes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY fecha DESC`, params);
    // Dentro de la misma fecha, orden por número (A999 antes que A1000).
    return filas.sort((a, b) => (a.fecha === b.fecha ? compararNumeros(b.numero, a.numero) : 0));
  }

  // Años y meses con albaranes, para el menú lateral.
  arbol() {
    const filas = this.consultar(`SELECT substr(fecha, 1, 4) AS anio, substr(fecha, 6, 2) AS mes, COUNT(*) AS n
                                  FROM albaranes WHERE fecha != '' GROUP BY anio, mes ORDER BY anio DESC, mes DESC`);
    const anios = [];
    for (const f of filas) {
      let a = anios.find((x) => x.anio === f.anio);
      if (!a) anios.push((a = { anio: f.anio, n: 0, meses: [] }));
      a.n += f.n;
      a.meses.push({ mes: f.mes, nombre: MESES[Number(f.mes) - 1], n: f.n });
    }
    const sinFecha = this.consultar("SELECT COUNT(*) AS n FROM albaranes WHERE fecha = ''")[0].n;
    const total = this.consultar('SELECT COUNT(*) AS n FROM albaranes')[0].n;
    return { total, sinFecha, anios };
  }

  obtener(id) {
    return this.consultar('SELECT * FROM albaranes WHERE id = ?', [id])[0] || null;
  }

  // Si cambian el número o la fecha, el PDF se renombra / se mueve a la carpeta del mes correcto.
  actualizar(id, cambios) {
    const actual = this.obtener(id);
    if (!actual) throw new Error('El albarán ya no existe');
    const nuevo = { ...actual };
    for (const c of CAMPOS_EDITABLES) if (c in cambios) nuevo[c] = String(cambios[c] ?? '');
    nuevo.numero = limpiarNumero(nuevo.numero);
    if (!nuevo.numero) throw new Error('El número no puede quedar vacío');
    if (this.existe(nuevo.numero, id)) throw new Error(`Ya hay otro albarán con el número ${nuevo.numero}`);

    if (nuevo.numero !== actual.numero || carpetaMes(nuevo.fecha) !== carpetaMes(actual.fecha)) {
      const anterior = this.rutaArchivo(actual);
      nuevo.archivo = this.colocar(anterior, nuevo.numero, nuevo.fecha, true);
      this.borrarCarpetaVacia(path.dirname(anterior));
    }
    this.db.run('UPDATE albaranes SET numero = ?, fecha = ?, notas = ?, archivo = ? WHERE id = ?', [nuevo.numero, nuevo.fecha, nuevo.notas, nuevo.archivo, id]);
    this.guardar();
    return this.obtener(id);
  }

  eliminar(id) {
    const fila = this.obtener(id);
    if (!fila) return false;
    this.db.run('DELETE FROM albaranes WHERE id = ?', [id]);
    this.guardar();
    fs.rmSync(this.rutaArchivo(fila), { force: true });
    this.borrarCarpetaVacia(path.dirname(this.rutaArchivo(fila)));
    return true;
  }

  borrarCarpetaVacia(dir) {
    while (path.resolve(dir) !== path.resolve(this.raiz) && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    }
  }

  // Números que faltan entre `desde` y `hasta` (ambos incluidos), p. ej. ('A500', 'A700').
  faltantes(desde, hasta) {
    const a = partirNumero(desde);
    const b = partirNumero(hasta);
    if (!a || !b) throw new Error('Escribe los números como en el albarán, por ejemplo A500');
    if (a.prefijo !== b.prefijo) throw new Error('Los dos números deben empezar por la misma letra');
    const [min, max] = a.valor <= b.valor ? [a.valor, b.valor] : [b.valor, a.valor];
    if (max - min > 100000) throw new Error('El intervalo es demasiado grande');

    const presentes = new Set();
    for (const { numero } of this.consultar('SELECT numero FROM albaranes')) {
      const p = partirNumero(numero);
      if (p && p.prefijo === a.prefijo && p.valor >= min && p.valor <= max) presentes.add(p.valor);
    }
    const ceros = (n) => String(n).padStart(Math.min(a.cifras, b.cifras), '0');
    const faltan = [];
    for (let n = min; n <= max; n++) if (!presentes.has(n)) faltan.push(a.prefijo + ceros(n));

    // Agrupa consecutivos: A510, A511, A512 -> "A510 – A512"
    const tramos = [];
    for (let n = min; n <= max; n++) {
      if (presentes.has(n)) continue;
      const inicio = n;
      while (n + 1 <= max && !presentes.has(n + 1)) n++;
      tramos.push(inicio === n ? a.prefijo + ceros(n) : `${a.prefijo}${ceros(inicio)} – ${a.prefijo}${ceros(n)}`);
    }
    return { desde: a.prefijo + ceros(min), hasta: a.prefijo + ceros(max), total: max - min + 1, encontrados: presentes.size, faltan, tramos };
  }

  // Copia el índice y todas las carpetas de meses a una carpeta nueva con fecha dentro de `destino`.
  copiaSeguridad(destino) {
    const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const carpeta = path.join(destino, `Albaranes-copia-${sello}`);
    if (path.resolve(carpeta).startsWith(path.resolve(this.raiz) + path.sep)) {
      throw new Error('Elige una carpeta que no esté dentro de la propia biblioteca');
    }
    fs.cpSync(this.raiz, carpeta, { recursive: true, filter: (f) => !f.endsWith('.tmp') });
    return carpeta;
  }
}

function compararNumeros(x, y) {
  const a = partirNumero(x);
  const b = partirNumero(y);
  if (!a || !b || a.prefijo !== b.prefijo) return String(x).localeCompare(String(y));
  return a.valor - b.valor;
}

module.exports = { Biblioteca, MESES, carpetaMes, partirNumero, limpiarNumero };
