// Biblioteca de albaranes: base de datos SQLite (sql.js) + carpeta con los PDF.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const CAMPOS_EDITABLES = ['numero', 'fecha', 'empresa', 'importe', 'estado', 'notas', 'texto'];

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS albaranes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  numero          TEXT    DEFAULT '',
  fecha           TEXT    DEFAULT '',
  empresa         TEXT    DEFAULT '',
  importe         REAL,
  estado          TEXT    DEFAULT 'pendiente',
  notas           TEXT    DEFAULT '',
  texto           TEXT    DEFAULT '',
  archivo         TEXT    NOT NULL,
  nombre_original TEXT    NOT NULL,
  tamano          INTEGER NOT NULL,
  subido          TEXT    NOT NULL
);`;

class Biblioteca {
  static async abrir(dir) {
    const SQL = await initSqlJs({
      locateFile: (f) => require.resolve(`sql.js/dist/${f}`).replace('app.asar', 'app.asar.unpacked'),
    });
    fs.mkdirSync(path.join(dir, 'archivos'), { recursive: true });
    const dbPath = path.join(dir, 'albaranes.db');
    const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
    db.run(ESQUEMA);
    return new Biblioteca(dir, dbPath, db);
  }

  constructor(dir, dbPath, db) {
    this.dir = dir;
    this.dbPath = dbPath;
    this.db = db;
  }

  // Escritura atómica: se guarda en un temporal y se renombra, para no corromper la base si se corta.
  guardar() {
    const tmp = this.dbPath + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.dbPath);
  }

  rutaArchivo(fila) {
    return path.join(this.dir, 'archivos', fila.archivo);
  }

  consultar(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const filas = [];
    while (stmt.step()) filas.push(stmt.getAsObject());
    stmt.free();
    return filas;
  }

  importar(origen) {
    if (path.extname(origen).toLowerCase() !== '.pdf') {
      throw new Error(`No es un PDF: ${path.basename(origen)}`);
    }
    const archivo = `${crypto.randomUUID()}.pdf`;
    fs.copyFileSync(origen, path.join(this.dir, 'archivos', archivo));
    this.db.run(
      'INSERT INTO albaranes (archivo, nombre_original, tamano, subido) VALUES (?, ?, ?, ?)',
      [archivo, path.basename(origen), fs.statSync(origen).size, new Date().toISOString()]
    );
    const id = this.consultar('SELECT last_insert_rowid() AS id')[0].id;
    this.guardar();
    return this.obtener(id);
  }

  listar({ busqueda = '', estado = '' } = {}) {
    const where = [];
    const params = [];
    if (busqueda.trim()) {
      const q = `%${busqueda.trim()}%`;
      where.push('(numero LIKE ? OR empresa LIKE ? OR notas LIKE ? OR nombre_original LIKE ? OR texto LIKE ?)');
      params.push(q, q, q, q, q);
    }
    if (estado) {
      where.push('estado = ?');
      params.push(estado);
    }
    const sql = `SELECT * FROM albaranes ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY COALESCE(NULLIF(fecha, ''), substr(subido, 1, 10)) DESC, id DESC`;
    return this.consultar(sql, params);
  }

  obtener(id) {
    return this.consultar('SELECT * FROM albaranes WHERE id = ?', [id])[0] || null;
  }

  actualizar(id, cambios) {
    const campos = Object.keys(cambios).filter((c) => CAMPOS_EDITABLES.includes(c));
    if (campos.length) {
      const valores = campos.map((c) => (c === 'importe' && cambios[c] === '' ? null : cambios[c]));
      this.db.run(`UPDATE albaranes SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...valores, id]);
      this.guardar();
    }
    return this.obtener(id);
  }

  eliminar(id) {
    const fila = this.obtener(id);
    if (!fila) return false;
    this.db.run('DELETE FROM albaranes WHERE id = ?', [id]);
    this.guardar();
    fs.rmSync(this.rutaArchivo(fila), { force: true });
    return true;
  }

  // Copia la base y todos los PDF a una carpeta nueva con fecha dentro de `destino`.
  copiaSeguridad(destino) {
    const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const carpeta = path.join(destino, `Albaranes-copia-${sello}`);
    fs.cpSync(this.dir, carpeta, { recursive: true });
    return carpeta;
  }
}

module.exports = { Biblioteca, CAMPOS_EDITABLES };
