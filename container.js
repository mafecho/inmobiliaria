const { createPool } = require('./db/pool');
const buildLeadRepository = require('./repositories/leadRepository');
const buildSaludRepository = require('./repositories/saludRepository');
const leadService = require('./services/leadService');
const { createLogger } = require('./services/logger');

// Composition root: único lugar que construye dependencias. createApp las
// destructura y reparte — nada recibe el container entero (ver app.js).
function buildRepos(db) {
  return {
    leads: buildLeadRepository(db),
    salud: buildSaludRepository(db)
  };
}

function createContainer(config) {
  const logger = createLogger(config.log);
  const pool = createPool(config.db);
  const repos = buildRepos(pool);

  const services = {
    leads: leadService({ repos })
  };

  return {
    config,
    logger,
    pool,
    repos,
    services,
    async close() {
      await pool.end();
    }
  };
}

module.exports = { createContainer, buildRepos };
