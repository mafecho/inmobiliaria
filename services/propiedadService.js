const { propiedadSchema, ESTADOS_PROPIEDAD, filtrosSchema } = require('../validators');
const { ValidationError, NotFoundError, ConflictError } = require('../errors');

// Orquesta el catálogo: valida, resuelve el slug, y compone propiedades con
// sus fotos. El SQL está en repositories/, el manejo de archivos en
// fotoService; acá vive la lógica que no es ni una cosa ni la otra.

const MAX_INTENTOS_SLUG = 50;

// "Apartamento en Laureles, 3 hab." -> "apartamento-en-laureles-3-hab"
//
// normalize('NFD') descompone cada letra acentuada en letra + diacrítico
// combinante, y el segundo replace borra esos diacríticos: á->a, ñ->n,
// ü->u. Perder la ñ es lo correcto para una URL — "cabana-campestre" es un
// slug válido y "cabaña" no lo es sin codificar.
function slugify(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

function propiedadService({ repos, logger, fotos }) {
  // Busca un slug libre agregando -2, -3... Nunca pisa el de otra propiedad.
  async function slugDisponible(base, exceptoId = null) {
    const raiz = base || 'propiedad';
    let candidato = raiz;

    for (let i = 2; i <= MAX_INTENTOS_SLUG; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (!await repos.propiedades.slugEnUso(candidato, exceptoId)) {
        return candidato;
      }
      candidato = `${raiz}-${i}`;
    }

    throw new ConflictError('No se pudo generar una dirección web única para esta propiedad');
  }

  function validar(input) {
    const parsed = propiedadSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message || 'Datos inválidos');
    }
    return parsed.data;
  }

  // Pega la foto principal a cada fila de un listado, con una sola consulta
  // para todas (ver fotoRepository.principalesDe).
  async function conFotoPrincipal(filas) {
    if (filas.length === 0) return [];
    const principales = await repos.fotos.principalesDe(filas.map((f) => f.id));
    return filas.map((fila) => ({
      ...fila,
      foto: principales.get(fila.id) || null
    }));
  }

  return {
    slugify,

    // --------------------------------------------------------------- panel

    async crear(input, usuarioId) {
      const datos = validar(input);
      const slug = await slugDisponible(slugify(datos.titulo));
      const id = await repos.propiedades.crear({ ...datos, slug }, usuarioId);
      logger.info('Propiedad creada', { id, slug, estado: datos.estado, usuarioId });
      return { id, slug };
    },

    async actualizar(id, input, usuarioId) {
      const existente = await repos.propiedades.obtenerPorId(id);
      if (!existente) throw new NotFoundError('Propiedad no encontrada');

      const datos = validar(input);

      // El slug NO se regenera al editar: si cambiara con el título, cada
      // corrección de texto rompería los enlaces que ya se compartieron por
      // WhatsApp y lo que Google tenga indexado.
      const afectadas = await repos.propiedades.actualizar(
        id,
        { ...datos, slug: existente.slug },
        usuarioId
      );

      logger.info('Propiedad actualizada', { id, estado: datos.estado, usuarioId });
      return { afectadas, slug: existente.slug };
    },

    async cambiarEstado(id, estado, usuarioId) {
      if (!ESTADOS_PROPIEDAD.includes(estado)) {
        throw new ValidationError('Estado inválido');
      }

      const afectadas = await repos.propiedades.cambiarEstado(id, estado, usuarioId);
      if (afectadas === 0) throw new NotFoundError('Propiedad no encontrada');

      logger.info('Estado de propiedad cambiado', { id, estado, usuarioId });
      return afectadas;
    },

    async eliminar(id, usuarioId) {
      const existente = await repos.propiedades.obtenerPorId(id);
      if (!existente) throw new NotFoundError('Propiedad no encontrada');

      // Los archivos primero: si se borra la fila y después falla el disco,
      // quedan fotos huérfanas que nadie sabe que existen. Al revés, si falla
      // el DELETE, las filas siguen apuntando a archivos que ya no están y el
      // panel lo muestra — un problema visible, que es mejor que uno mudo.
      await fotos.eliminarTodasDe(id);
      await repos.propiedades.eliminar(id);

      logger.info('Propiedad eliminada', { id, slug: existente.slug, usuarioId });
    },

    async obtenerParaPanel(id) {
      const propiedad = await repos.propiedades.obtenerPorId(id);
      if (!propiedad) throw new NotFoundError('Propiedad no encontrada');
      const galeria = await repos.fotos.deLaPropiedad(id);
      return { propiedad, fotos: galeria };
    },

    async listarParaPanel(opciones) {
      const { filas, total } = await repos.propiedades.listarParaPanel(opciones);
      const conteos = await repos.propiedades.contarPorEstado();
      return { filas, total, conteos };
    },

    // Autocompletado del campo "zona" en el formulario. Incluye zonas de
    // propiedades no publicadas: el objetivo es que el asesor escriba el
    // sector igual que la vez pasada, no mostrar sólo lo que está al aire.
    async zonasUsadas() {
      return repos.propiedades.zonasUsadas();
    },

    // Para los selectores del sitio público: sólo zonas con algo publicado,
    // para no ofrecer un filtro que no devuelve nada.
    async zonasPublicadas() {
      return repos.propiedades.zonasPublicadas();
    },

    // ------------------------------------------------------------- público

    async listarPublicas(query) {
      const parsed = filtrosSchema.safeParse(query || {});
      // Un filtro inválido en la URL no es un error que merezca una página de
      // error: se ignora y se muestra el catálogo sin filtrar.
      const filtros = parsed.success ? parsed.data : { pagina: 1 };

      const { filas, total, pagina, porPagina } = await repos.propiedades.listarPublicas(filtros);
      const zonas = await repos.propiedades.zonasPublicadas();

      return {
        propiedades: await conFotoPrincipal(filas),
        total,
        pagina,
        porPagina,
        totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
        filtros,
        zonas
      };
    },

    async obtenerPublica(slug) {
      const propiedad = await repos.propiedades.obtenerPublicaPorSlug(slug);
      if (!propiedad) throw new NotFoundError('Propiedad no encontrada');

      const galeria = await repos.fotos.deLaPropiedad(propiedad.id);
      const similares = await repos.propiedades.listarPublicas({
        tipo: propiedad.tipo,
        operacion: propiedad.operacion,
        pagina: 1
      });

      return {
        propiedad,
        fotos: galeria,
        similares: (await conFotoPrincipal(similares.filas))
          .filter((p) => p.id !== propiedad.id)
          .slice(0, 3)
      };
    },

    // Alimenta la sección "destacados" de la landing, que en Fase 1 tenía el
    // portafolio escrito a mano dentro del propio template.
    async destacadasParaLanding(limite = 6) {
      const filas = await repos.propiedades.destacadasPublicas(limite);
      return conFotoPrincipal(filas);
    }
  };
}

module.exports = propiedadService;
module.exports.slugify = slugify;
