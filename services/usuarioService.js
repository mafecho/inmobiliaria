const { usuarioCrearSchema, usuarioEditarSchema } = require('../validators');
const { ValidationError, NotFoundError, ConflictError } = require('../errors');

// Gestión de cuentas del panel. Sólo un rol 'admin' llega acá: lo garantiza
// middleware/requireAuth.js antes de la ruta, no este servicio.
//
// Las dos reglas que protegen al negocio de sí mismo:
//
//   - No se puede dejar el panel sin ningún administrador activo. Sin esto,
//     un admin puede degradarse a asesor por error y nadie podría volver a
//     crear cuentas ni reactivar a nadie: habría que entrar a la base a mano.
//   - Desactivar una cuenta cierra sus sesiones abiertas. Si no, alguien a
//     quien acaban de sacar del equipo sigue dentro del panel hasta que su
//     cookie venza — hasta 12 horas con la configuración por defecto.

function usuarioService({ repos, logger, auth }) {
  async function garantizarUltimoAdmin(usuarioId, { rolNuevo, activoNuevo }) {
    const actual = await repos.usuarios.porId(usuarioId);
    if (!actual) throw new NotFoundError('Usuario no encontrado');

    const dejaDeSerAdminActivo = actual.rol === 'admin' && actual.activo
      && (rolNuevo !== 'admin' || activoNuevo === false);

    if (!dejaDeSerAdminActivo) return;

    const otros = await repos.usuarios.contarAdminsActivos(usuarioId);
    if (otros === 0) {
      throw new ConflictError(
        'Es el único administrador activo. Nombre otro administrador antes de cambiar esta cuenta.'
      );
    }
  }

  return {
    async listar() {
      return repos.usuarios.listar();
    },

    async obtener(id) {
      const usuario = await repos.usuarios.porId(id);
      if (!usuario) throw new NotFoundError('Usuario no encontrado');
      return usuario;
    },

    async crear(input, creadoPorId) {
      const parsed = usuarioCrearSchema.safeParse(input);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message || 'Datos inválidos');
      }

      const { nombre, email, password, rol } = parsed.data;

      // Se comprueba antes para dar un mensaje claro, pero la verdad la tiene
      // el índice UNIQUE de la base: entre esta consulta y el INSERT pueden
      // entrar dos altas simultáneas con el mismo correo.
      if (await repos.usuarios.porEmail(email)) {
        throw new ConflictError('Ya existe una cuenta con ese correo');
      }

      const passwordHash = await auth.hashear(password);

      let id;
      try {
        id = await repos.usuarios.crear({ nombre, email, passwordHash, rol });
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          throw new ConflictError('Ya existe una cuenta con ese correo');
        }
        throw err;
      }

      logger.info('Cuenta creada', { id, rol, creadoPorId });
      return id;
    },

    async actualizar(id, input, editadoPorId) {
      const parsed = usuarioEditarSchema.safeParse(input);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message || 'Datos inválidos');
      }

      const { nombre, rol, activo } = parsed.data;

      await garantizarUltimoAdmin(id, { rolNuevo: rol, activoNuevo: activo });

      const afectadas = await repos.usuarios.actualizar(id, { nombre, rol, activo });
      if (afectadas === 0) throw new NotFoundError('Usuario no encontrado');

      if (!activo) {
        const cerradas = await repos.sesiones.eliminarDeUsuario(id);
        logger.info('Cuenta desactivada, sesiones cerradas', { id, cerradas, editadoPorId });
      } else {
        logger.info('Cuenta actualizada', { id, rol, editadoPorId });
      }

      return afectadas;
    },

    // Reseteo de contraseña por un administrador. El cambio de la propia
    // contraseña pasa por el mismo camino (authService.cambiarPassword), que
    // además cierra las sesiones abiertas de esa cuenta.
    async resetearPassword(id, input, adminId) {
      const usuario = await repos.usuarios.porId(id);
      if (!usuario) throw new NotFoundError('Usuario no encontrado');

      await auth.cambiarPassword(id, input);
      logger.info('Contraseña reseteada por un administrador', { id, adminId });
    }
  };
}

module.exports = usuarioService;
