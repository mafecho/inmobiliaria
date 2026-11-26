const express = require('express');
const path = require('path');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const asyncHandler = require('./middleware/asyncHandler');
const { createErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const {
  createPanelDisponible, createRequireAuth, exponerEnVistas
} = require('./middleware/auth');
const { prepararCsrf } = require('./middleware/csrf');
const createPublicRouter = require('./routes/public');
const createAuthRouter = require('./routes/auth');
const createAdminRouter = require('./routes/admin');
const formato = require('./services/formato');

// Más de esto y se considera la base caída — responder 503 pronto es mejor
// que dejar un monitor externo esperando un timeout mudo.
const SALUD_TIEMPO_MAXIMO_MS = 2000;

function createApp({ repos, services, config, logger, sessionStore }) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', 1);

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

  // Las fotos de las propiedades se sirven desde config.uploads.dir, que en
  // producción está FUERA del docroot. Por eso necesitan su propio static:
  // Apache no las puede servir directamente como hace con /css o /js.
  //
  // immutable y un año de caché son seguros porque el nombre del archivo es
  // aleatorio y único: una foto nunca cambia de contenido, se reemplaza por
  // otra con otro nombre.
  app.use('/fotos', express.static(config.uploads.dir, {
    maxAge: '365d',
    immutable: true,
    index: false,
    // Sin esto, una petición a /fotos/ sin nombre de archivo podría listar la
    // carpeta en algunas configuraciones.
    redirect: false
  }));

  // Helpers de formato disponibles en todas las vistas, para que los
  // templates no repitan la lógica de mostrar pesos, áreas y etiquetas.
  app.locals.f = formato;

  // no-cache (no no-store): el navegador puede guardar la landing, pero debe
  // preguntar si cambió. Con el ETag de Express la respuesta habitual es un
  // 304 sin cuerpo.
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-cache');
    next();
  });

  const contactLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.contactMax,
    standardHeaders: true,
    legacyHeaders: false
  });

  // ------------------------------------------------------------- panel

  // Sólo se monta la sesión si hay un secreto real con el que firmar las
  // cookies. Sin él, panelDisponible responde 503 en todo /admin y el sitio
  // público queda intacto.
  if (config.session.habilitado) {
    app.use('/admin', session({
      name: 'echavarria.sid',
      secret: config.session.secret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        // En producción el sitio va por HTTPS; en local no, y marcarla
        // secure impediría entrar al panel desde http://localhost.
        secure: config.isProduction,
        sameSite: 'lax',
        maxAge: config.session.maxAgeMs
      }
    }));

    sessionStore.iniciarLimpieza();
  }

  const panelDisponible = createPanelDisponible({ config, logger });
  const requireAuth = createRequireAuth({ logger });

  // Login: necesita sesión y CSRF, pero no autenticación previa.
  app.use('/admin', panelDisponible, exponerEnVistas, prepararCsrf,
    createAuthRouter({ services, config, logger }));

  // Resto del panel: ya detrás de requireAuth.
  app.use('/admin', panelDisponible, requireAuth,
    createAdminRouter({ services, config, logger }));

  // ------------------------------------------------------------ público

  app.use('/', createPublicRouter({ services, config, contactLimiter, logger }));

  // Chequeo de salud para el monitor externo: mide que Node atienda Y que la
  // base conteste. Nunca lanza, nunca cuelga (tiempo máximo), no explica el
  // motivo en la respuesta (eso va al log).
  app.get('/salud', asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let temporizador;
    try {
      await Promise.race([
        repos.salud.ping(),
        new Promise((_, rechazar) => {
          temporizador = setTimeout(() => rechazar(new Error('la base no respondió a tiempo')), SALUD_TIEMPO_MAXIMO_MS);
        })
      ]);
      res.json({ estado: 'ok' });
    } catch (err) {
      logger.warn('Chequeo de salud fallido', { motivo: err.message });
      res.status(503).json({ estado: 'error' });
    } finally {
      clearTimeout(temporizador);
    }
  }));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ config, logger }));

  return app;
}

module.exports = { createApp };
