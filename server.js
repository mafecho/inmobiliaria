const { loadConfig } = require('./config');
const { createContainer } = require('./container');
const { createApp } = require('./app');
const { runMigrations } = require('./db/migrate');

const config = loadConfig();
const container = createContainer(config);

// Migraciones antes de escuchar: si el schema no está donde el código
// espera, mejor no aceptar tráfico.
runMigrations(config.db, container.logger).then(({ aplicadas }) => {
  if (aplicadas.length > 0) {
    container.logger.info('Schema actualizado', { migraciones: aplicadas });
  }

  const app = createApp(container);

  app.listen(config.port, () => {
    container.logger.info('Echavarría Grupo Inmobiliario escuchando', {
      port: config.port, domain: config.domain, env: config.nodeEnv
    });
  });
}).catch(err => {
  container.logger.excepcion('No se pudo inicializar la base de datos', err);
  process.exit(1);
});
