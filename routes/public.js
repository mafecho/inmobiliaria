const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { ValidationError } = require('../errors');
const { TIPOS_PROPIEDAD, OPERACIONES } = require('../validators');

// Routing es cableado: lee entrada, llama al servicio, responde. Todo el SQL
// y la validación viven una capa más adentro (repositories/ y services/).

function createPublicRouter({ services, config, contactLimiter, logger }) {
  const router = express.Router();

  // La landing muestra las propiedades publicadas. Si la consulta falla, la
  // página se sirve igual con la lista vacía: el resto de la landing —
  // servicios, formulario de contacto, FAQ — no depende de la base, y
  // tumbarla entera por el catálogo sería repetir el error que ya nos dejó el
  // sitio caído (ver el comentario de server.js).
  router.get('/', asyncHandler(async (req, res) => {
    let destacadas = [];
    let zonas = [];
    try {
      destacadas = await services.propiedades.destacadasParaLanding(6);
      zonas = await services.propiedades.zonasPublicadas();
    } catch (err) {
      logger.excepcion('No se pudieron cargar las propiedades destacadas', err);
    }

    res.render('index', {
      contacto: config.contacto,
      domain: config.domain,
      formStatus: req.query.form || null,
      destacadas,
      zonas,
      tipos: TIPOS_PROPIEDAD
    });
  }));

  // ------------------------------------------------------------ catálogo

  router.get('/propiedades', asyncHandler(async (req, res) => {
    const resultado = await services.propiedades.listarPublicas(req.query);

    res.render('propiedades/lista', {
      titulo: 'Propiedades disponibles',
      contacto: config.contacto,
      domain: config.domain,
      ...resultado,
      tipos: TIPOS_PROPIEDAD,
      operaciones: OPERACIONES
    });
  }));

  router.get('/propiedades/:slug', asyncHandler(async (req, res) => {
    const { propiedad, fotos, similares } = await services.propiedades
      .obtenerPublica(req.params.slug);

    res.render('propiedades/ficha', {
      titulo: propiedad.titulo,
      contacto: config.contacto,
      domain: config.domain,
      propiedad,
      fotos,
      similares,
      formStatus: req.query.form || null
    });
  }));

  // ------------------------------------------------------------- contacto

  // Un solo endpoint recibe el formulario de toda la landing (consignar,
  // comprar, cada servicio) — `tipo` viene de un input oculto por sección.
  // Un ValidationError es parte del flujo normal de un formulario público:
  // se redirige de vuelta con un flag en vez de mostrar la página de error
  // genérica, para no romper la experiencia de página única.
  router.post('/contacto', contactLimiter, asyncHandler(async (req, res) => {
    // `volver` permite que el formulario de una ficha de propiedad devuelva a
    // esa ficha y no a la landing. Sólo rutas internas, para que no se vuelva
    // un redirector abierto.
    const volver = typeof req.body.volver === 'string'
      && req.body.volver.startsWith('/')
      && !req.body.volver.startsWith('//')
      ? req.body.volver
      : '/';

    try {
      await services.leads.submit(req.body);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.redirect(volver + '?form=error#contacto');
      }
      throw err;
    }
    return res.redirect(volver + '?form=ok#contacto');
  }));

  return router;
}

module.exports = createPublicRouter;
