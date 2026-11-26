// SQL de la galería. Guarda sólo el nombre del archivo; dónde vive en disco
// lo resuelve services/fotoService.js a partir de config.uploads.dir.

function buildFotoRepository(db) {
  return {
    async agregar({ propiedadId, archivo, alt, orden }) {
      const [result] = await db.query(
        `INSERT INTO propiedad_fotos (propiedad_id, archivo, alt, orden)
         VALUES (?, ?, ?, ?)`,
        [propiedadId, archivo, alt || null, orden]
      );
      return result.insertId;
    },

    async deLaPropiedad(propiedadId) {
      const [filas] = await db.query(
        `SELECT id, propiedad_id, archivo, alt, orden
           FROM propiedad_fotos
          WHERE propiedad_id = ?
          ORDER BY orden, id`,
        [propiedadId]
      );
      return filas;
    },

    // Una sola consulta para las fotos principales de varias propiedades, en
    // vez de una por tarjeta: con 9 propiedades por página, N+1 consultas se
    // notan. Devuelve un Map propiedadId -> archivo.
    async principalesDe(propiedadIds) {
      if (!propiedadIds || propiedadIds.length === 0) return new Map();

      const marcadores = propiedadIds.map(() => '?').join(', ');
      const [filas] = await db.query(
        `SELECT f.propiedad_id, f.archivo, f.alt
           FROM propiedad_fotos f
           INNER JOIN (
             SELECT propiedad_id, MIN(orden) AS min_orden
               FROM propiedad_fotos
              WHERE propiedad_id IN (${marcadores})
              GROUP BY propiedad_id
           ) m ON m.propiedad_id = f.propiedad_id AND m.min_orden = f.orden
          GROUP BY f.propiedad_id, f.archivo, f.alt`,
        propiedadIds
      );

      return filas.reduce(
        (mapa, f) => mapa.set(f.propiedad_id, { archivo: f.archivo, alt: f.alt }),
        new Map()
      );
    },

    async porId(id) {
      const [filas] = await db.query(
        'SELECT id, propiedad_id, archivo, alt, orden FROM propiedad_fotos WHERE id = ?',
        [id]
      );
      return filas[0] || null;
    },

    async eliminar(id) {
      const [result] = await db.query('DELETE FROM propiedad_fotos WHERE id = ?', [id]);
      return result.affectedRows;
    },

    async siguienteOrden(propiedadId) {
      const [[fila]] = await db.query(
        'SELECT COALESCE(MAX(orden), -1) + 1 AS siguiente FROM propiedad_fotos WHERE propiedad_id = ?',
        [propiedadId]
      );
      return fila.siguiente;
    },

    async contarDeLaPropiedad(propiedadId) {
      const [[fila]] = await db.query(
        'SELECT COUNT(*) AS total FROM propiedad_fotos WHERE propiedad_id = ?',
        [propiedadId]
      );
      return fila.total;
    },

    // Reordenar la galería: el orden que manda el panel se aplica fila por
    // fila dentro de una transacción, para que un fallo a mitad no deje la
    // galería con órdenes duplicados o huecos raros.
    async reordenar(propiedadId, idsEnOrden) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        for (let i = 0; i < idsEnOrden.length; i += 1) {
          await conn.query(
            'UPDATE propiedad_fotos SET orden = ? WHERE id = ? AND propiedad_id = ?',
            [i, idsEnOrden[i], propiedadId]
          );
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
  };
}

module.exports = buildFotoRepository;
