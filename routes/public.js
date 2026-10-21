const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { ValidationError } = require('../errors');

// Routing es cableado: lee entrada, llama al servicio, responde. Todo el SQL
// y la validación viven una capa más adentro (repositories/ y services/).
function createPublicRouter({ services, config, contactLimiter }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.render('index', {
      contacto: config.contacto,
      domain: config.domain,
      formStatus: req.query.form || null
    });
  });

  // Un solo endpoint recibe el formulario de toda la landing (consignar,
  // comprar, cada servicio) — `tipo` viene de un input oculto por sección.
  // Un ValidationError es parte del flujo normal de un formulario público:
  // se redirige de vuelta con un flag en vez de mostrar la página de error
  // genérica, para no romper la experiencia de página única.
  router.post('/contacto', contactLimiter, asyncHandler(async (req, res) => {
    try {
      await services.leads.submit(req.body);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.redirect('/?form=error#contacto');
      }
      throw err;
    }
    res.redirect('/?form=ok#contacto');
  }));

  return router;
}

module.exports = createPublicRouter;
