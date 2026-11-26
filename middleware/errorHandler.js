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
// multer lanza MulterError con un `code` propio cuando se pasa de los límites
// configurados. Sin traducirlo, subir una foto de 8 MB daría un 500 y un
// stack trace en el log, cuando en realidad es una entrada inválida del
// usuario y merece un mensaje que se entienda.
const MENSAJES_MULTER = {
  LIMIT_FILE_SIZE: 'Alguna de las imágenes supera el tamaño máximo permitido',
  LIMIT_FILE_COUNT: 'Se intentaron subir más imágenes de las permitidas',
  LIMIT_UNEXPECTED_FILE: 'Se recibió un archivo en un campo inesperado'
};

function traducirMulter(err) {
  if (err.name !== 'MulterError') return null;
  return {
    statusCode: 400,
    expected: true,
    message: MENSAJES_MULTER[err.code] || 'No se pudo procesar el archivo enviado'
  };
}

function createErrorHandler({ config, logger }) {
  return function errorHandler(err, req, res, next) {
    const comoMulter = traducirMulter(err);
    if (comoMulter) {
      Object.assign(err, comoMulter);
    }

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
  401: 'Necesita entrar',
  403: 'Sin permiso',
  404: 'No encontrado',
  409: 'Conflicto',
  429: 'Demasiados intentos',
  500: 'Error',
  503: 'No disponible'
};

module.exports = { createErrorHandler, notFoundHandler, wantsJson, traducirMulter };
