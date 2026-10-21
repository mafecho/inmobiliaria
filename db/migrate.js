const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Runner de migraciones versionadas, igual al de enelmapa: aplica los .sql en
// orden alfabético y anota cada uno en `schema_migrations`. Sin rollback a
// propósito — el DDL de MySQL es auto-commit, así que un ALTER a medias no se
// puede revertir con una transacción; la defensa es que cada migración sea
// chica e idempotente.

const DIR = path.join(__dirname, 'migrations');
const ESPERA_CANDADO_S = 30;

async function crearTablaDeControl(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function archivosDeMigracion(dir = DIR) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

// `dir` inyectable sólo para tests del runner; la app nunca lo pasa.
async function runMigrations(dbConfig, logger = console, { dir = DIR } = {}) {
  const conn = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    multipleStatements: true
  });

  // Candado con nombre del lado de MySQL: evita que dos arranques simultáneos
  // (p.ej. `--watch` reiniciando, o varios workers de Passenger) apliquen la
  // misma migración a la vez.
  const candado = 'vivantia_migraciones_' + dbConfig.database;

  try {
    const [[tomado]] = await conn.query('SELECT GET_LOCK(?, ?) AS ok', [candado, ESPERA_CANDADO_S]);
    if (tomado.ok !== 1) {
      throw new Error(
        'No se pudo tomar el candado de migraciones (' + candado + ') en ' +
        ESPERA_CANDADO_S + 's. Otro proceso las está aplicando.'
      );
    }

    await crearTablaDeControl(conn);

    const [filas] = await conn.query('SELECT name FROM schema_migrations');
    const yaAplicadas = new Set(filas.map(f => f.name));

    const pendientes = archivosDeMigracion(dir).filter(f => !yaAplicadas.has(f));

    if (pendientes.length === 0) {
      logger.debug?.('Base al día, sin migraciones pendientes', { aplicadas: yaAplicadas.size });
      return { aplicadas: [], yaEstaban: yaAplicadas.size };
    }

    const aplicadas = [];
    for (const archivo of pendientes) {
      const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');

      try {
        await conn.query(sql);
      } catch (err) {
        err.message = 'Falló la migración ' + archivo + ': ' + err.message;
        throw err;
      }

      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [archivo]);
      aplicadas.push(archivo);
      logger.info?.('Migración aplicada', { archivo });
    }

    return { aplicadas, yaEstaban: yaAplicadas.size };
  } finally {
    try { await conn.query('SELECT RELEASE_LOCK(?)', [candado]); } catch (e) { /* la conexión ya se cayó */ }
    await conn.end();
  }
}

module.exports = { runMigrations, archivosDeMigracion };
