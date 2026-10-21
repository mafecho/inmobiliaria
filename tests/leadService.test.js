const leadService = require('../services/leadService');
const { ValidationError } = require('../errors');

function fakeRepos() {
  const creados = [];
  return {
    creados,
    leads: {
      async create(data) {
        creados.push(data);
        return creados.length;
      }
    }
  };
}

describe('leadService.submit', () => {
  test('guarda un lead válido con los campos normalizados', async () => {
    const repos = fakeRepos();
    const service = leadService({ repos });

    await service.submit({
      tipo: 'consignar',
      nombre: '  María Pérez  ',
      telefono: '3001234567',
      email: '',
      mensaje: ''
    });

    expect(repos.creados).toHaveLength(1);
    expect(repos.creados[0].nombre).toBe('María Pérez');
    expect(repos.creados[0].tipo).toBe('consignar');
  });

  test('rechaza un tipo que no está en la lista permitida', async () => {
    const repos = fakeRepos();
    const service = leadService({ repos });

    await expect(service.submit({
      tipo: 'algo-inventado',
      nombre: 'Juan',
      telefono: '3000000000'
    })).rejects.toBeInstanceOf(ValidationError);

    expect(repos.creados).toHaveLength(0);
  });

  test('rechaza un nombre demasiado corto', async () => {
    const repos = fakeRepos();
    const service = leadService({ repos });

    await expect(service.submit({
      tipo: 'contacto',
      nombre: 'A',
      telefono: '3000000000'
    })).rejects.toBeInstanceOf(ValidationError);
  });
});
