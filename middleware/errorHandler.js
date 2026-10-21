const { NotFoundError } = require('../errors');

function wantsJson(req) {
  if (req.xhr) return true;
  return (req.get('accept') || '').includes('application/json');
}

function notFoundHandler(req, res, next) {
  next(new NotFoundError('Página no encontrada'));
}

// Recibe config/logger como parámetros (no un singleton) para poder testear
// sin manipular el registro de módulos.
function createErrorHandler({ config, logger }) {
  return function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const isServerError = statusCode >= 500;
    const contexto = { method: req.method, url: req.originalUrl, status: statusCode };

    if (isServerError || !err.expected) {
      logger.excepcion('Error no previsto', err, contexto);
    } else {
      logger.warn(err.name + ': ' + err.message, contexto);
    }

    if (res.headersSent) return next(err);

    const message = isServerError && config.isProduction ? 'Error interno' : err.message;

    if (wantsJson(req)) {
      return res.status(statusCode).json({ ok: false, error: message });
    }

    res.status(statusCode).render('error', {
      message,
      statusCode,
      titulo: TITULOS[statusCode] || (isServerError ? 'Error' : 'Algo salió mal')
    });
  };
}

const TITULOS = {
  400: 'Solicitud inválida',
  404: 'No encontrado',
  429: 'Demasiados intentos',
  500: 'Error'
};

module.exports = { createErrorHandler, notFoundHandler, wantsJson };
