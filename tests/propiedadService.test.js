const propiedadService = require('../services/propiedadService');
const { slugify } = require('../services/propiedadService');
const { ValidationError, NotFoundError, ConflictError } = require('../errors');

// Repos y logger simulados: igual que leadService.test.js, estos tests no
// tocan la base. Lo que se prueba acá es la lógica del servicio — slugs,
// validación, y que el slug NO cambie al editar.

function fakeLogger() {
  return { info: () => {}, warn: () => {}, debug: () => {}, excepcion: () => {} };
}

function fakeRepos({ slugsOcupados = [], existentes = {} } = {}) {
  const creadas = [];
  const actualizadas = [];
  const estados = [];

  return {
    creadas,
    actualizadas,
    estados,
    propiedades: {
      async crear(datos, usuarioId) {
        creadas.push({ datos, usuarioId });
        return creadas.length;
      },
      async actualizar(id, datos, usuarioId) {
        actualizadas.push({ id, datos, usuarioId });
        return 1;
      },
      async cambiarEstado(id, estado, usuarioId) {
        estados.push({ id, estado, usuarioId });
        return existentes[id] ? 1 : 0;
      },
      async obtenerPorId(id) {
        return existentes[id] || null;
      },
      async slugEnUso(slug) {
        return slugsOcupados.includes(slug);
      },
      async eliminar() { return 1; },
      async listarPublicas() { return { filas: [], total: 0, pagina: 1, porPagina: 9 }; },
      async zonasPublicadas() { return []; }
    },
    fotos: {
      async deLaPropiedad() { return []; },
      async principalesDe() { return new Map(); }
    }
  };
}

function fakeFotos() {
  const borradas = [];
  return {
    borradas,
    async eliminarTodasDe(id) { borradas.push(id); return 0; }
  };
}

const BASE = {
  titulo: 'Apartamento con vista al parque',
  tipo: 'apartamento',
  operacion: 'venta',
  zona: 'Laureles',
  precio: '450.000.000'
};

describe('slugify', () => {
  test('convierte un título en una dirección web limpia', () => {
    expect(slugify('Apartamento en Laureles, 3 hab.')).toBe('apartamento-en-laureles-3-hab');
  });

  test('quita los acentos y la ñ, que no son válidos en una URL sin codificar', () => {
    expect(slugify('Cabaña campestre — Río Claro')).toBe('cabana-campestre-rio-claro');
  });

  test('colapsa separadores repetidos y recorta los de los extremos', () => {
    expect(slugify('   Lote   1.200 m²!!!   ')).toBe('lote-1-200-m');
  });
});

describe('propiedadService.crear', () => {
  test('genera el slug a partir del título y guarda el usuario que la creó', async () => {
    const repos = fakeRepos();
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    const { slug } = await service.crear(BASE, 7);

    expect(slug).toBe('apartamento-con-vista-al-parque');
    expect(repos.creadas).toHaveLength(1);
    expect(repos.creadas[0].usuarioId).toBe(7);
  });

  test('normaliza el precio escrito con puntos a un entero de pesos', async () => {
    const repos = fakeRepos();
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    await service.crear(BASE, 1);

    expect(repos.creadas[0].datos.precio).toBe(450000000);
  });

  test('agrega un sufijo cuando el slug ya está ocupado', async () => {
    const repos = fakeRepos({ slugsOcupados: ['apartamento-con-vista-al-parque'] });
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    const { slug } = await service.crear(BASE, 1);

    expect(slug).toBe('apartamento-con-vista-al-parque-2');
  });

  test('nace en borrador si no se indica estado, para no publicar sin querer', async () => {
    const repos = fakeRepos();
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    await service.crear(BASE, 1);

    expect(repos.creadas[0].datos.estado).toBe('borrador');
  });

  test('rechaza un precio en cero', async () => {
    const repos = fakeRepos();
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    await expect(service.crear({ ...BASE, precio: '0' }, 1))
      .rejects.toBeInstanceOf(ValidationError);
    expect(repos.creadas).toHaveLength(0);
  });

  test('rechaza un tipo de inmueble que no está en la lista', async () => {
    const repos = fakeRepos();
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    await expect(service.crear({ ...BASE, tipo: 'castillo' }, 1))
      .rejects.toBeInstanceOf(ValidationError);
  });

  test('falla con ConflictError si no hay ningún slug libre', async () => {
    const ocupados = ['apartamento-con-vista-al-parque'];
    for (let i = 2; i <= 50; i += 1) ocupados.push('apartamento-con-vista-al-parque-' + i);

    const repos = fakeRepos({ slugsOcupados: ocupados });
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    await expect(service.crear(BASE, 1)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('propiedadService.actualizar', () => {
  test('conserva el slug original aunque cambie el título', async () => {
    // Es la garantía de que los enlaces ya compartidos por WhatsApp y lo que
    // Google tenga indexado no se rompen al corregir un texto.
    const repos = fakeRepos({
      existentes: { 5: { id: 5, slug: 'slug-original', titulo: 'Título viejo' } }
    });
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    const { slug } = await service.actualizar(5, { ...BASE, titulo: 'Un título completamente nuevo' }, 3);

    expect(slug).toBe('slug-original');
    expect(repos.actualizadas[0].datos.slug).toBe('slug-original');
  });

  test('falla si la propiedad no existe', async () => {
    const repos = fakeRepos();
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    await expect(service.actualizar(99, BASE, 1)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('propiedadService.cambiarEstado', () => {
  test('publica una propiedad existente', async () => {
    const repos = fakeRepos({ existentes: { 5: { id: 5, slug: 's' } } });
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    await service.cambiarEstado(5, 'disponible', 2);

    expect(repos.estados[0]).toEqual({ id: 5, estado: 'disponible', usuarioId: 2 });
  });

  test('rechaza un estado que no existe en el vocabulario', async () => {
    const repos = fakeRepos({ existentes: { 5: { id: 5 } } });
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    await expect(service.cambiarEstado(5, 'publicada', 1))
      .rejects.toBeInstanceOf(ValidationError);
    expect(repos.estados).toHaveLength(0);
  });

  test('falla si la propiedad no existe', async () => {
    const repos = fakeRepos();
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    await expect(service.cambiarEstado(404, 'disponible', 1))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('propiedadService.eliminar', () => {
  test('borra los archivos antes que la fila, para no dejar fotos huérfanas', async () => {
    const repos = fakeRepos({ existentes: { 8: { id: 8, slug: 's' } } });
    const fotos = fakeFotos();
    const service = propiedadService({ repos, logger: fakeLogger(), fotos });

    await service.eliminar(8, 1);

    expect(fotos.borradas).toEqual([8]);
  });

  test('no toca el disco si la propiedad no existe', async () => {
    const repos = fakeRepos();
    const fotos = fakeFotos();
    const service = propiedadService({ repos, logger: fakeLogger(), fotos });

    await expect(service.eliminar(99, 1)).rejects.toBeInstanceOf(NotFoundError);
    expect(fotos.borradas).toHaveLength(0);
  });
});

describe('propiedadService.listarPublicas', () => {
  test('ignora filtros inválidos en vez de fallar: la URL la escribe cualquiera', async () => {
    const repos = fakeRepos();
    const service = propiedadService({ repos, logger: fakeLogger(), fotos: fakeFotos() });

    const r = await service.listarPublicas({ tipo: 'castillo', pagina: 'abc' });

    expect(r.propiedades).toEqual([]);
    expect(r.pagina).toBe(1);
  });
});
