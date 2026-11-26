const { loadConfig } = require('./config');
const { createContainer } = require('./container');
const { createApp } = require('./app');
const { runMigrations } = require('./db/migrate');

const config = loadConfig();
const container = createContainer(config);
const app = createApp(container);

// La carpeta de fotos se prepara al arrancar, no en la primera subida: si
// falla por permisos, es mejor verlo en el log del arranque que cuando un
// asesor está intentando publicar una propiedad.
if (!container.services.fotos.asegurarCarpeta()) {
  container.logger.warn(
    'La carpeta de fotos no está disponible: se podrá navegar el sitio, '
    + 'pero no subir imágenes nuevas',
    { dir: config.uploads.dir }
  );
}

// Aviso temprano y explícito: en producción sin SESSION_SECRET el panel
// responde 503 en todas sus rutas. No se cae el proceso a propósito — la
// landing pública no depende de eso.
if (!config.session.habilitado) {
  container.logger.error(
    'Falta SESSION_SECRET: el panel de administración queda deshabilitado. '
    + 'El sitio público funciona normalmente.'
  );
}

// Escuchar primero y migrar después, a propósito.
//
// La landing (`GET /`) se renderiza sólo con valores de config: no toca la
// base — ver routes/public.js. Las únicas rutas que la necesitan son
// `POST /contacto`, para guardar el lead, y `/salud`.
//
// Antes esto corría al revés: las migraciones bloqueaban el `listen` y
// cualquier falla hacía `process.exit(1)`, así que un problema de MySQL
// dejaba caída una página que no lee MySQL. En Passenger es peor, porque
// varios workers arrancan a la vez y el candado de db/migrate.js hace
// esperar 30s a los que pierden la carrera — suficiente para pasarse del
// tiempo de arranque que el servidor tolera y que ninguno llegue a servir.
//
// El precio es que una petición puede llegar antes de que el schema esté
// listo. Para la landing no cambia nada, y el formulario ya fallaba en ese
// caso. Quien reporta el estado real de la base es `/salud`, que hace ping
// y responde 503 — ese es el canal para el monitor externo, no la caída del
// proceso.
app.listen(config.port, () => {
  container.logger.info('Echavarría Grupo Inmobiliario escuchando', {
    port: config.port, domain: config.domain, env: config.nodeEnv
  });
});

runMigrations(config.db, container.logger).then(({ aplicadas }) => {
  if (aplicadas.length > 0) {
    container.logger.info('Schema actualizado', { migraciones: aplicadas });
  }
}).catch(err => {
  container.logger.excepcion(
    'No se pudo inicializar la base de datos: la landing se sirve igual, '
    + 'pero el formulario no va a guardar leads hasta que se resuelva',
    err
  );
});
