// SQL del store de sesiones. Lo consume services/sessionStore.js, que es
// quien implementa la interfaz que espera express-session.
//
// `expires` son milisegundos epoch para poder comparar contra Date.now() sin
// convertir zonas horarias en cada consulta.

function buildSesionRepository(db) {
  return {
    async obtener(sid) {
      const [filas] = await db.query(
        'SELECT data, expires FROM sesiones WHERE sid = ?',
        [sid]
      );
      return filas[0] || null;
    },

    async guardar(sid, data, expires) {
      // INSERT ... ON DUPLICATE KEY UPDATE y no un SELECT previo: express
      // llama a set() en cada petición que toca la sesión, y hacerlo en dos
      // viajes abre una carrera entre peticiones concurrentes del mismo
      // usuario.
      await db.query(
        `INSERT INTO sesiones (sid, data, expires) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data), expires = VALUES(expires)`,
        [sid, data, expires]
      );
    },

    async tocar(sid, expires) {
      await db.query('UPDATE sesiones SET expires = ? WHERE sid = ?', [expires, sid]);
    },

    async eliminar(sid) {
      await db.query('DELETE FROM sesiones WHERE sid = ?', [sid]);
    },

    async limpiarVencidas(ahora = Date.now()) {
      const [result] = await db.query('DELETE FROM sesiones WHERE expires < ?', [ahora]);
      return result.affectedRows;
    },

    async contar(ahora = Date.now()) {
      const [[fila]] = await db.query(
        'SELECT COUNT(*) AS total FROM sesiones WHERE expires >= ?',
        [ahora]
      );
      return fila.total;
    },

    // Cierra todas las sesiones de un usuario. Se usa al desactivar una
    // cuenta: sin esto, alguien a quien acaban de sacar del equipo seguiría
    // dentro del panel hasta que su cookie venza.
    async eliminarDeUsuario(usuarioId) {
      const [result] = await db.query(
        'DELETE FROM sesiones WHERE data LIKE ?',
        [`%"usuarioId":${Number(usuarioId)}%`]
      );
      return result.affectedRows;
    }
  };
}

module.exports = buildSesionRepository;
