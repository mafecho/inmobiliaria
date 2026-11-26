// SQL de las cuentas del panel. El hash de la contraseña entra y sale de acá
// ya calculado: quien hashea y compara es services/authService.js, porque eso
// es una regla de negocio y no una consulta.
//
// `porEmailParaLogin` es la única función que devuelve `password_hash`. Las
// demás lo omiten explícitamente para que un hash no termine, por descuido,
// renderizado en una vista o serializado en la sesión.

const CAMPOS_SEGUROS = 'id, nombre, email, rol, activo, ultimo_acceso, created_at';

function buildUsuarioRepository(db) {
  return {
    async crear({ nombre, email, passwordHash, rol }) {
      const [result] = await db.query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol)
         VALUES (?, ?, ?, ?)`,
        [nombre, email, passwordHash, rol]
      );
      return result.insertId;
    },

    // Incluye el hash y el estado `activo` porque el login necesita los dos:
    // una cuenta desactivada no debe poder entrar aunque la clave sea válida.
    async porEmailParaLogin(email) {
      const [filas] = await db.query(
        'SELECT id, nombre, email, password_hash, rol, activo FROM usuarios WHERE email = ?',
        [email]
      );
      return filas[0] || null;
    },

    async porId(id) {
      const [filas] = await db.query(
        `SELECT ${CAMPOS_SEGUROS} FROM usuarios WHERE id = ?`,
        [id]
      );
      return filas[0] || null;
    },

    async porEmail(email) {
      const [filas] = await db.query(
        `SELECT ${CAMPOS_SEGUROS} FROM usuarios WHERE email = ?`,
        [email]
      );
      return filas[0] || null;
    },

    async listar() {
      const [filas] = await db.query(
        `SELECT ${CAMPOS_SEGUROS} FROM usuarios ORDER BY activo DESC, nombre`
      );
      return filas;
    },

    async actualizar(id, { nombre, rol, activo }) {
      const [result] = await db.query(
        'UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE id = ?',
        [nombre, rol, activo ? 1 : 0, id]
      );
      return result.affectedRows;
    },

    async cambiarPassword(id, passwordHash) {
      const [result] = await db.query(
        'UPDATE usuarios SET password_hash = ? WHERE id = ?',
        [passwordHash, id]
      );
      return result.affectedRows;
    },

    async registrarAcceso(id) {
      await db.query(
        'UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );
    },

    // Para no dejar el panel sin ningún administrador activo: lo consulta
    // services/usuarioService.js antes de degradar o desactivar a un admin.
    async contarAdminsActivos(exceptoId = null) {
      const [[fila]] = exceptoId
        ? await db.query(
          'SELECT COUNT(*) AS total FROM usuarios WHERE rol = ? AND activo = 1 AND id <> ?',
          ['admin', exceptoId]
        )
        : await db.query(
          'SELECT COUNT(*) AS total FROM usuarios WHERE rol = ? AND activo = 1',
          ['admin']
        );
      return fila.total;
    }
  };
}

module.exports = buildUsuarioRepository;
