const crypto = require('crypto');

const { ForbiddenError } = require('../errors');

// Protección CSRF por token de sesión (patrón "synchronizer token").
//
// Hace falta porque el panel usa cookie de sesión: sin esto, una página
// cualquiera podría hacer que el navegador de un asesor con sesión abierta
// envíe un POST a /admin/propiedades/7/eliminar sin que él lo sepa.
//
// No se usa el paquete `csurf` porque está descontinuado desde 2022. Son
// treinta líneas y el mecanismo es el mismo.
//
// SameSite=Lax en la cookie (ver app.js) ya frena la mayoría de los casos,
// pero es una segunda capa, no un reemplazo: protege contra navegadores
// viejos y contra envíos de formulario desde el propio sitio.

const LARGO_TOKEN = 32;

// Métodos que no modifican nada: no se verifican, pero sí generan el token
// para que los formularios que se renderizan ahí lo tengan.
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

function generarToken(req) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(LARGO_TOKEN).toString('hex');
  }
  return req.session.csrf;
}

// Siempre antes de las rutas del panel: asegura el token y lo publica a las
// vistas para que los formularios lo incluyan.
function prepararCsrf(req, res, next) {
  if (!req.session) return next();
  res.locals.csrfToken = generarToken(req);
  return next();
}

function comparar(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // timingSafeEqual exige la misma longitud, así que la diferencia de tamaño
  // se descarta antes (y no filtra nada: el largo del token es público).
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Verifica el token en las peticiones que modifican estado.
//
// IMPORTANTE con formularios de archivos: multer es quien llena req.body en
// un envío multipart, así que en esas rutas este middleware tiene que ir
// DESPUÉS de multer. Si va antes, req.body está vacío y el token nunca
// aparece. Por eso createVerificarCsrf se salta los multipart cuando corre a
// nivel de router, y las rutas de subida lo aplican explícitamente después
// del middleware de subida — ver routes/admin.js.
function createVerificarCsrf({ logger, saltarMultipart = false } = {}) {
  return function verificarCsrf(req, res, next) {
    if (METODOS_SEGUROS.has(req.method)) return next();
    if (!req.session) return next();

    const esMultipart = (req.get('content-type') || '').includes('multipart/form-data');
    if (saltarMultipart && esMultipart) return next();

    const enviado = (req.body && req.body._csrf) || req.get('x-csrf-token');
    const esperado = req.session.csrf;

    if (!esperado || !enviado || !comparar(enviado, esperado)) {
      if (logger) {
        logger.warn('Petición rechazada por token CSRF inválido', {
          method: req.method,
          url: req.originalUrl,
          tenia_token: Boolean(enviado)
        });
      }
      return next(new ForbiddenError(
        'La sesión del formulario expiró. Recargue la página e inténtelo de nuevo.'
      ));
    }

    return next();
  };
}

module.exports = { prepararCsrf, createVerificarCsrf, generarToken };
