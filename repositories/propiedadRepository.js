const { ESTADO_PUBLICO } = require('../validators');

// Todo el SQL del catálogo vive acá. Las rutas y los servicios no saben que
// esto es MySQL.
//
// Las consultas públicas y las del panel están separadas a propósito: las
// públicas filtran SIEMPRE por estado = 'disponible' dentro del propio
// repositorio, para que una ruta pública no pueda filtrar mal por descuido y
// terminar publicando borradores. No existe un "listar todo" que el lado
// público pueda llamar por accidente.

const POR_PAGINA = 9;

// Campos que el sitio público puede ver. `direccion` queda deliberadamente
// fuera: es un dato interno que el asesor usa para identificar el inmueble.
const CAMPOS_PUBLICOS = `
  id, slug, titulo, tipo, operacion, zona, precio, administracion,
  habitaciones, banos, parqueaderos, area_m2, estrato, descripcion,
  destacada, created_at
`;

function vacioANull(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}

// Arma el WHERE de las búsquedas públicas. Devuelve fragmento + valores para
// consulta parametrizada; nunca concatena datos del usuario dentro del SQL.
function construirFiltros(filtros = {}) {
  const condiciones = ['estado = ?'];
  const valores = [ESTADO_PUBLICO];

  if (filtros.tipo) {
    condiciones.push('tipo = ?');
    valores.push(filtros.tipo);
  }
  if (filtros.operacion) {
    condiciones.push('operacion = ?');
    valores.push(filtros.operacion);
  }
  if (filtros.zona) {
    condiciones.push('zona = ?');
    valores.push(filtros.zona);
  }
  if (filtros.precioMin !== undefined) {
    condiciones.push('precio >= ?');
    valores.push(filtros.precioMin);
  }
  if (filtros.precioMax !== undefined) {
    condiciones.push('precio <= ?');
    valores.push(filtros.precioMax);
  }
  if (filtros.habitaciones !== undefined) {
    condiciones.push('habitaciones >= ?');
    valores.push(filtros.habitaciones);
  }

  return { where: condiciones.join(' AND '), valores };
}

function buildPropiedadRepository(db) {
  return {
    porPagina: POR_PAGINA,

    // ------------------------------------------------------------- panel

    async crear(datos, usuarioId) {
      const [result] = await db.query(
        `INSERT INTO propiedades
           (slug, titulo, tipo, operacion, estado, zona, direccion, precio,
            administracion, habitaciones, banos, parqueaderos, area_m2,
            estrato, descripcion, destacada, creado_por, actualizado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          datos.slug, datos.titulo, datos.tipo, datos.operacion, datos.estado,
          datos.zona, vacioANull(datos.direccion), datos.precio,
          vacioANull(datos.administracion), vacioANull(datos.habitaciones),
          vacioANull(datos.banos), vacioANull(datos.parqueaderos),
          vacioANull(datos.area_m2), vacioANull(datos.estrato),
          vacioANull(datos.descripcion), datos.destacada ? 1 : 0,
          usuarioId, usuarioId
        ]
      );
      return result.insertId;
    },

    async actualizar(id, datos, usuarioId) {
      const [result] = await db.query(
        `UPDATE propiedades SET
           slug = ?, titulo = ?, tipo = ?, operacion = ?, estado = ?, zona = ?,
           direccion = ?, precio = ?, administracion = ?, habitaciones = ?,
           banos = ?, parqueaderos = ?, area_m2 = ?, estrato = ?,
           descripcion = ?, destacada = ?, actualizado_por = ?
         WHERE id = ?`,
        [
          datos.slug, datos.titulo, datos.tipo, datos.operacion, datos.estado,
          datos.zona, vacioANull(datos.direccion), datos.precio,
          vacioANull(datos.administracion), vacioANull(datos.habitaciones),
          vacioANull(datos.banos), vacioANull(datos.parqueaderos),
          vacioANull(datos.area_m2), vacioANull(datos.estrato),
          vacioANull(datos.descripcion), datos.destacada ? 1 : 0,
          usuarioId, id
        ]
      );
      return result.affectedRows;
    },

    // Cambio de estado aislado: es la acción más frecuente del panel
    // (marcar como disponible) y no tiene por qué reescribir toda la fila.
    async cambiarEstado(id, estado, usuarioId) {
      const [result] = await db.query(
        'UPDATE propiedades SET estado = ?, actualizado_por = ? WHERE id = ?',
        [estado, usuarioId, id]
      );
      return result.affectedRows;
    },

    async eliminar(id) {
      const [result] = await db.query('DELETE FROM propiedades WHERE id = ?', [id]);
      return result.affectedRows;
    },

    async obtenerPorId(id) {
      const [filas] = await db.query('SELECT * FROM propiedades WHERE id = ?', [id]);
      return filas[0] || null;
    },

    async listarParaPanel({ estado, pagina = 1, porPagina = POR_PAGINA } = {}) {
      const condiciones = [];
      const valores = [];
      if (estado) {
        condiciones.push('p.estado = ?');
        valores.push(estado);
      }
      const where = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
      const offset = (pagina - 1) * porPagina;

      const [filas] = await db.query(
        `SELECT p.*, u.nombre AS creador_nombre,
                (SELECT COUNT(*) FROM propiedad_fotos f WHERE f.propiedad_id = p.id)
                  AS total_fotos
           FROM propiedades p
           LEFT JOIN usuarios u ON u.id = p.creado_por
           ${where}
          ORDER BY p.updated_at DESC
          LIMIT ? OFFSET ?`,
        [...valores, porPagina, offset]
      );

      const [[conteo]] = await db.query(
        `SELECT COUNT(*) AS total FROM propiedades p ${where}`,
        valores
      );

      return { filas, total: conteo.total };
    },

    async contarPorEstado() {
      const [filas] = await db.query(
        'SELECT estado, COUNT(*) AS total FROM propiedades GROUP BY estado'
      );
      return filas.reduce((acc, f) => Object.assign(acc, { [f.estado]: f.total }), {});
    },

    // ----------------------------------------------------------- público

    async listarPublicas(filtros = {}) {
      const { where, valores } = construirFiltros(filtros);
      const pagina = filtros.pagina || 1;
      const offset = (pagina - 1) * POR_PAGINA;

      const [filas] = await db.query(
        `SELECT ${CAMPOS_PUBLICOS}
           FROM propiedades
          WHERE ${where}
          ORDER BY destacada DESC, updated_at DESC
          LIMIT ? OFFSET ?`,
        [...valores, POR_PAGINA, offset]
      );

      const [[conteo]] = await db.query(
        `SELECT COUNT(*) AS total FROM propiedades WHERE ${where}`,
        valores
      );

      return { filas, total: conteo.total, pagina, porPagina: POR_PAGINA };
    },

    async obtenerPublicaPorSlug(slug) {
      const [filas] = await db.query(
        `SELECT ${CAMPOS_PUBLICOS} FROM propiedades WHERE slug = ? AND estado = ?`,
        [slug, ESTADO_PUBLICO]
      );
      return filas[0] || null;
    },

    async destacadasPublicas(limite = 6) {
      const [filas] = await db.query(
        `SELECT ${CAMPOS_PUBLICOS}
           FROM propiedades
          WHERE estado = ?
          ORDER BY destacada DESC, updated_at DESC
          LIMIT ?`,
        [ESTADO_PUBLICO, limite]
      );
      return filas;
    },

    // Todas las zonas escritas hasta ahora, publicadas o no. Alimenta el
    // autocompletado del formulario para que el asesor escriba "Laureles"
    // igual que la vez pasada: si una queda como "laureles" y otra como
    // "Laureles ", el filtro del catálogo las trata como sectores distintos.
    async zonasUsadas() {
      const [filas] = await db.query(
        'SELECT DISTINCT zona FROM propiedades ORDER BY zona'
      );
      return filas.map((f) => f.zona);
    },

    // Alimenta el select de zonas del catálogo con lo que realmente hay
    // publicado, en vez de una lista fija inventada.
    async zonasPublicadas() {
      const [filas] = await db.query(
        'SELECT DISTINCT zona FROM propiedades WHERE estado = ? ORDER BY zona',
        [ESTADO_PUBLICO]
      );
      return filas.map((f) => f.zona);
    },

    // ------------------------------------------------------------- slugs

    async slugEnUso(slug, exceptoId = null) {
      const [filas] = exceptoId
        ? await db.query(
          'SELECT id FROM propiedades WHERE slug = ? AND id <> ? LIMIT 1',
          [slug, exceptoId]
        )
        : await db.query(
          'SELECT id FROM propiedades WHERE slug = ? LIMIT 1',
          [slug]
        );
      return filas.length > 0;
    }
  };
}

module.exports = buildPropiedadRepository;
