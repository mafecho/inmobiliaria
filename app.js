const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const asyncHandler = require('./middleware/asyncHandler');
const { createErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const createPublicRouter = require('./routes/public');

// Más de esto y se considera la base caída — responder 503 pronto es mejor
// que dejar un monitor externo esperando un timeout mudo.
const SALUD_TIEMPO_MAXIMO_MS = 2000;

function createApp({ repos, services, config, logger }) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', 1);

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

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

  app.use('/', createPublicRouter({ services, config, contactLimiter }));

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
