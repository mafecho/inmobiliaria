const express = require('express');

const asyncHandler = require('../middleware/asyncHandler');
const { requireAdmin } = require('../middleware/auth');
const { createVerificarCsrf } = require('../middleware/csrf');
const {
  TIPOS_PROPIEDAD, OPERACIONES, ESTADOS_PROPIEDAD, ROLES
} = require('../validators');

// Panel de administración. Todo lo de acá ya pasó por panelDisponible y
// requireAuth (ver app.js), así que req.usuario siempre existe.

function createAdminRouter({ services, config, logger }) {
  const router = express.Router();

  // Verificación CSRF a nivel de router para los formularios normales. Se
  // salta los multipart porque en esos req.body todavía está vacío: lo llena
  // multer, que corre después. Las rutas de subida la aplican explícitamente
  // tras el middleware de subida (más abajo).
  const verificarCsrf = createVerificarCsrf({ logger, saltarMultipart: true });
  const verificarCsrfMultipart = createVerificarCsrf({ logger, saltarMultipart: false });

  router.use(verificarCsrf);

  function flash(req, tipo, mensaje) {
    req.session.flash = { tipo, mensaje };
  }

  const catalogos = {
    tipos: TIPOS_PROPIEDAD,
    operaciones: OPERACIONES,
    estados: ESTADOS_PROPIEDAD,
    roles: ROLES
  };

  // Locals comunes del formulario de propiedad. Cuatro rutas renderizan esa
  // misma vista —alta, alta fallida, edición y edición fallida— y sin esto
  // cada dato nuevo del formulario obligaba a tocar las cuatro.
  async function localesFormulario(extra) {
    return {
      catalogos,
      fotos: [],
      error: null,
      zonasUsadas: await services.propiedades.zonasUsadas(),
      maxFotos: config.uploads.maxPorPropiedad,
      maxMb: Math.round(config.uploads.maxBytes / (1024 * 1024)),
      ...extra
    };
  }

  // ------------------------------------------------------------- tablero

  router.get('/', asyncHandler(async (req, res) => {
    const estado = typeof req.query.estado === 'string' && ESTADOS_PROPIEDAD.includes(req.query.estado)
      ? req.query.estado
      : null;
    const pagina = Math.max(1, Number(req.query.pagina) || 1);

    const { filas, total, conteos } = await services.propiedades.listarParaPanel({ estado, pagina });

    res.render('admin/propiedades-lista', {
      titulo: 'Propiedades',
      propiedades: filas,
      total,
      conteos,
      estadoActual: estado,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(total / 9)),
      catalogos
    });
  }));

  // -------------------------------------------------------- propiedades

  router.get('/propiedades/nueva', asyncHandler(async (req, res) => {
    res.render('admin/propiedad-form', await localesFormulario({
      titulo: 'Nueva propiedad',
      propiedad: null
    }));
  }));

  router.post('/propiedades', asyncHandler(async (req, res) => {
    try {
      const { id } = await services.propiedades.crear(req.body, req.usuario.usuarioId);
      flash(req, 'ok', 'Propiedad creada. Ahora puede agregarle fotos.');
      return res.redirect('/admin/propiedades/' + id);
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        // Se devuelve el formulario con lo que el asesor ya había escrito:
        // perder una descripción larga por un campo mal puesto es la forma
        // más rápida de que nadie quiera usar el panel.
        return res.status(err.statusCode).render('admin/propiedad-form', await localesFormulario({
          titulo: 'Nueva propiedad',
          propiedad: req.body,
          error: err.message
        }));
      }
      throw err;
    }
  }));

  router.get('/propiedades/:id', asyncHandler(async (req, res) => {
    const { propiedad, fotos } = await services.propiedades.obtenerParaPanel(Number(req.params.id));

    res.render('admin/propiedad-form', await localesFormulario({
      titulo: propiedad.titulo,
      propiedad,
      fotos
    }));
  }));

  router.post('/propiedades/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    try {
      await services.propiedades.actualizar(id, req.body, req.usuario.usuarioId);
      flash(req, 'ok', 'Cambios guardados.');
      return res.redirect('/admin/propiedades/' + id);
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        const { fotos } = await services.propiedades.obtenerParaPanel(id);
        return res.status(err.statusCode).render('admin/propiedad-form', await localesFormulario({
          titulo: 'Editar propiedad',
          propiedad: { ...req.body, id },
          fotos,
          error: err.message
        }));
      }
      throw err;
    }
  }));

  // Atajo del listado: es la acción más frecuente del panel, y pedir que
  // entren a editar la propiedad entera para publicarla sobra.
  router.post('/propiedades/:id/estado', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await services.propiedades.cambiarEstado(id, req.body.estado, req.usuario.usuarioId);

    const publicada = req.body.estado === 'disponible';
    flash(req, 'ok', publicada
      ? 'Propiedad publicada: ya aparece en el sitio.'
      : 'Propiedad actualizada: ya no aparece en el sitio.');

    return res.redirect(req.body.volver || '/admin');
  }));

  router.post('/propiedades/:id/eliminar', asyncHandler(async (req, res) => {
    await services.propiedades.eliminar(Number(req.params.id), req.usuario.usuarioId);
    flash(req, 'ok', 'Propiedad eliminada, junto con sus fotos.');
    return res.redirect('/admin');
  }));

  // -------------------------------------------------------------- fotos

  // Orden deliberado: primero multer (llena req.body y escribe los archivos),
  // después la verificación CSRF. Al revés el token nunca llegaría.
  router.post(
    '/propiedades/:id/fotos',
    services.fotos.middlewareSubida,
    verificarCsrfMultipart,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      // Confirma que la propiedad existe antes de registrar nada.
      await services.propiedades.obtenerParaPanel(id);

      const { agregadas, rechazadas } = await services.fotos.registrar(id, req.files);

      flash(req, rechazadas > 0 ? 'aviso' : 'ok',
        rechazadas > 0
          ? `${agregadas} foto(s) agregada(s). ${rechazadas} archivo(s) rechazado(s) por no ser imágenes válidas.`
          : `${agregadas} foto(s) agregada(s).`);

      return res.redirect('/admin/propiedades/' + id);
    })
  );

  router.post('/propiedades/:id/fotos/:fotoId/eliminar', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await services.fotos.eliminar(Number(req.params.fotoId), id);
    flash(req, 'ok', 'Foto eliminada.');
    return res.redirect('/admin/propiedades/' + id);
  }));

  router.post('/propiedades/:id/fotos/:fotoId/portada', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await services.fotos.hacerPortada(id, Number(req.params.fotoId));
    flash(req, 'ok', 'Portada actualizada. Es la foto que se ve en el catálogo.');
    return res.redirect('/admin/propiedades/' + id);
  }));

  // ----------------------------------------------------------- usuarios

  router.get('/usuarios', requireAdmin, asyncHandler(async (req, res) => {
    res.render('admin/usuarios', {
      titulo: 'Asesores',
      usuarios: await services.usuarios.listar(),
      catalogos,
      error: null
    });
  }));

  router.post('/usuarios', requireAdmin, asyncHandler(async (req, res) => {
    try {
      await services.usuarios.crear(req.body, req.usuario.usuarioId);
      flash(req, 'ok', 'Cuenta creada.');
      return res.redirect('/admin/usuarios');
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        return res.status(err.statusCode).render('admin/usuarios', {
          titulo: 'Asesores',
          usuarios: await services.usuarios.listar(),
          catalogos,
          error: err.message
        });
      }
      throw err;
    }
  }));

  router.post('/usuarios/:id', requireAdmin, asyncHandler(async (req, res) => {
    try {
      await services.usuarios.actualizar(Number(req.params.id), req.body, req.usuario.usuarioId);
      flash(req, 'ok', 'Cuenta actualizada.');
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        flash(req, 'error', err.message);
      } else {
        throw err;
      }
    }
    return res.redirect('/admin/usuarios');
  }));

  router.post('/usuarios/:id/password', requireAdmin, asyncHandler(async (req, res) => {
    try {
      await services.usuarios.resetearPassword(
        Number(req.params.id), req.body, req.usuario.usuarioId
      );
      flash(req, 'ok', 'Contraseña actualizada. Las sesiones de esa cuenta se cerraron.');
    } catch (err) {
      if (err.statusCode === 400) flash(req, 'error', err.message);
      else throw err;
    }
    return res.redirect('/admin/usuarios');
  }));

  // -------------------------------------------------------- cuenta propia

  router.get('/mi-cuenta', (req, res) => {
    res.render('admin/mi-cuenta', { titulo: 'Mi cuenta', error: null });
  });

  router.post('/mi-cuenta/password', asyncHandler(async (req, res) => {
    try {
      await services.auth.cambiarPassword(req.usuario.usuarioId, req.body);
    } catch (err) {
      if (err.statusCode === 400) {
        return res.status(400).render('admin/mi-cuenta', {
          titulo: 'Mi cuenta', error: err.message
        });
      }
      throw err;
    }
    // cambiarPassword cierra las sesiones de la cuenta, incluida ésta: el
    // usuario tiene que volver a entrar con la contraseña nueva.
    return res.redirect('/admin/login');
  }));

  return router;
}

module.exports = createAdminRouter;
