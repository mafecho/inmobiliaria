const { UnauthorizedError, ForbiddenError } = require('../errors');

// Guardias del panel. Reciben config/logger como parámetros, no como
// singleton, igual que createErrorHandler.

// Sin SESSION_SECRET en producción no hay sesiones seguras posibles. En vez
// de tumbar el proceso —la landing pública no tiene por qué caerse por esto—
// el panel entero responde 503 y lo deja dicho en el log del arranque.
function createPanelDisponible({ config, logger }) {
  let avisado = false;

  return function panelDisponible(req, res, next) {
    if (config.session.habilitado) return next();

    if (!avisado) {
      logger.error(
        'Panel deshabilitado: falta SESSION_SECRET. El sitio público sigue funcionando.'
      );
      avisado = true;
    }

    return res.status(503).render('error', {
      statusCode: 503,
      titulo: 'Panel no disponible',
      message: 'El panel de administración no está configurado en este servidor. '
        + 'Falta la variable SESSION_SECRET.'
    });
  };
}

// Exige sesión iniciada. Para una petición normal del navegador redirige al
// login conservando a dónde quería ir, así el asesor no pierde el formulario
// que estaba abriendo cuando se le venció la sesión.
function createRequireAuth({ logger }) {
  return function requireAuth(req, res, next) {
    const usuario = req.session && req.session.usuario;

    if (!usuario) {
      if (req.method === 'GET' && !req.xhr) {
        const destino = encodeURIComponent(req.originalUrl);
        return res.redirect('/admin/login?volver=' + destino);
      }
      return next(new UnauthorizedError('Su sesión expiró. Vuelva a entrar.'));
    }

    req.usuario = usuario;
    return next();
  };
}

// Exige rol admin. Va siempre DESPUÉS de requireAuth.
function requireAdmin(req, res, next) {
  if (!req.usuario) {
    return next(new UnauthorizedError('Su sesión expiró. Vuelva a entrar.'));
  }
  if (req.usuario.rol !== 'admin') {
    return next(new ForbiddenError('Esta sección es sólo para administradores'));
  }
  return next();
}

// Deja al usuario y los mensajes de un solo uso disponibles para las vistas,
// para no pasarlos a mano en cada res.render.
function exponerEnVistas(req, res, next) {
  res.locals.usuario = (req.session && req.session.usuario) || null;

  const flash = (req.session && req.session.flash) || null;
  res.locals.flash = flash;
  if (flash && req.session) delete req.session.flash;

  return next();
}

module.exports = {
  createPanelDisponible,
  createRequireAuth,
  requireAdmin,
  exponerEnVistas
};
