const { createPool } = require('./db/pool');

const buildLeadRepository = require('./repositories/leadRepository');
const buildSaludRepository = require('./repositories/saludRepository');
const buildPropiedadRepository = require('./repositories/propiedadRepository');
const buildUsuarioRepository = require('./repositories/usuarioRepository');
const buildFotoRepository = require('./repositories/fotoRepository');
const buildSesionRepository = require('./repositories/sesionRepository');

const leadService = require('./services/leadService');
const authService = require('./services/authService');
const fotoService = require('./services/fotoService');
const propiedadService = require('./services/propiedadService');
const usuarioService = require('./services/usuarioService');
const { createLogger } = require('./services/logger');
const { SesionStore } = require('./services/sessionStore');

// Composition root: único lugar que construye dependencias. createApp las
// destructura y reparte — nada recibe el container entero (ver app.js).

function buildRepos(db) {
  return {
    leads: buildLeadRepository(db),
    salud: buildSaludRepository(db),
    propiedades: buildPropiedadRepository(db),
    usuarios: buildUsuarioRepository(db),
    fotos: buildFotoRepository(db),
    sesiones: buildSesionRepository(db)
  };
}

// El orden importa: authService no depende de nadie, fotoService tampoco,
// propiedadService necesita fotos para borrar archivos al eliminar una
// propiedad, y usuarioService necesita auth para hashear contraseñas.
function buildServices({ repos, logger, config }) {
  const auth = authService({ repos, logger });
  const fotos = fotoService({ repos, logger, config });

  return {
    leads: leadService({ repos }),
    auth,
    fotos,
    propiedades: propiedadService({ repos, logger, fotos }),
    usuarios: usuarioService({ repos, logger, auth })
  };
}

function createContainer(config) {
  const logger = createLogger(config.log);
  const pool = createPool(config.db);
  const repos = buildRepos(pool);
  const services = buildServices({ repos, logger, config });

  // El store se construye siempre, pero app.js sólo monta express-session si
  // config.session.habilitado — en producción sin SESSION_SECRET el panel
  // queda deshabilitado y el sitio público sigue sirviendo.
  const sessionStore = new SesionStore({
    repo: repos.sesiones,
    logger,
    maxAgeMs: config.session.maxAgeMs
  });

  return {
    config,
    logger,
    pool,
    repos,
    services,
    sessionStore,
    async close() {
      sessionStore.detenerLimpieza();
      await pool.end();
    }
  };
}

module.exports = { createContainer, buildRepos, buildServices };
