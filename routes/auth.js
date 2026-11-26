const express = require('express');
const rateLimit = require('express-rate-limit');

const asyncHandler = require('../middleware/asyncHandler');

// Entrada y salida del panel. Routing es cableado: lee la entrada, llama al
// servicio y responde. Quién valida la contraseña es services/authService.js.

function createAuthRouter({ services, config, logger }) {
  const router = express.Router();

  // Límite de intentos por IP. Con bcrypt a ~90ms por verificación, sin esto
  // un atacante puede probar unas 600 contraseñas por minuto contra una
  // cuenta conocida.
  const loginLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.loginMax,
    standardHeaders: true,
    legacyHeaders: false,
    // Sólo cuentan los intentos fallidos: a quien entra bien no se le gasta
    // el cupo por recargar el formulario.
    skipSuccessfulRequests: true,
    message: 'Demasiados intentos. Espere unos minutos.'
  });

  router.get('/login', (req, res) => {
    if (req.session && req.session.usuario) {
      return res.redirect('/admin');
    }
    return res.render('admin/login', {
      titulo: 'Entrar al panel',
      volver: typeof req.query.volver === 'string' ? req.query.volver : '',
      error: null
    });
  });

  router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const volver = typeof req.body.volver === 'string' ? req.body.volver : '';

    let usuario;
    try {
      usuario = await services.auth.autenticar(req.body);
    } catch (err) {
      if (err.statusCode === 401) {
        // Se responde en la misma página, con 401, en vez de redirigir: así
        // el mensaje no viaja en la URL ni queda en el historial.
        return res.status(401).render('admin/login', {
          titulo: 'Entrar al panel',
          volver,
          error: err.message
        });
      }
      throw err;
    }

    // Regenerar la sesión al autenticar (anti session fixation): si alguien
    // logró fijarle al navegador un ID de sesión conocido antes del login,
    // ese ID queda inservible en vez de convertirse en una sesión válida.
    return req.session.regenerate((err) => {
      if (err) {
        logger.excepcion('No se pudo regenerar la sesión al entrar', err);
        return res.status(500).render('admin/login', {
          titulo: 'Entrar al panel',
          volver,
          error: 'No se pudo iniciar la sesión. Inténtelo de nuevo.'
        });
      }

      req.session.usuario = usuario;

      // Sólo se acepta un destino interno. Sin esto, /admin/login?volver=
      // https://otro-sitio convierte el login en un redirector abierto que
      // sirve para phishing.
      const destino = volver.startsWith('/') && !volver.startsWith('//')
        ? volver
        : '/admin';

      return req.session.save(() => res.redirect(destino));
    });
  }));

  router.post('/logout', (req, res) => {
    const usuarioId = req.session && req.session.usuario && req.session.usuario.usuarioId;

    return req.session.destroy((err) => {
      if (err) logger.warn('Error al cerrar sesión', { motivo: err.message });
      else logger.info('Sesión cerrada', { usuarioId });

      res.clearCookie('echavarria.sid');
      return res.redirect('/admin/login');
    });
  });

  return router;
}

module.exports = createAuthRouter;
