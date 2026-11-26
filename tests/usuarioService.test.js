const usuarioService = require('../services/usuarioService');
const { ValidationError, NotFoundError, ConflictError } = require('../errors');

// Lo importante de este servicio son las dos barreras que protegen al negocio
// de sí mismo: no quedarse sin administradores, y cerrar las sesiones de una
// cuenta al desactivarla.

function fakeLogger() {
  return { info: () => {}, warn: () => {}, debug: () => {}, excepcion: () => {} };
}

function fakeAuth() {
  const cambios = [];
  return {
    cambios,
    async hashear(password) { return 'hash-de:' + password; },
    async cambiarPassword(id, input) { cambios.push({ id, input }); }
  };
}

function fakeRepos({ usuarios = {}, porEmail = null, adminsActivosOtros = 1 } = {}) {
  const creados = [];
  const actualizados = [];
  const sesionesCerradas = [];

  return {
    creados,
    actualizados,
    sesionesCerradas,
    usuarios: {
      async crear(datos) { creados.push(datos); return creados.length; },
      async porId(id) { return usuarios[id] || null; },
      async porEmail() { return porEmail; },
      async listar() { return Object.values(usuarios); },
      async actualizar(id, datos) {
        if (!usuarios[id]) return 0;
        actualizados.push({ id, datos });
        return 1;
      },
      async contarAdminsActivos() { return adminsActivosOtros; }
    },
    sesiones: {
      async eliminarDeUsuario(id) { sesionesCerradas.push(id); return 2; }
    }
  };
}

const NUEVO = {
  nombre: 'Carlos Ruiz',
  email: 'carlos@echavarria-gi.com',
  password: 'clavesegura123',
  rol: 'asesor'
};

describe('usuarioService.crear', () => {
  test('hashea la contraseña antes de guardarla', async () => {
    const repos = fakeRepos();
    const auth = fakeAuth();
    const service = usuarioService({ repos, logger: fakeLogger(), auth });

    await service.crear(NUEVO, 1);

    expect(repos.creados[0].passwordHash).toBe('hash-de:clavesegura123');
    expect(repos.creados[0].password).toBeUndefined();
  });

  test('normaliza el correo a minúsculas', async () => {
    const repos = fakeRepos();
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await service.crear({ ...NUEVO, email: '  CARLOS@Echavarria-GI.com ' }, 1);

    expect(repos.creados[0].email).toBe('carlos@echavarria-gi.com');
  });

  test('rechaza un correo ya registrado', async () => {
    const repos = fakeRepos({ porEmail: { id: 9, email: 'carlos@echavarria-gi.com' } });
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await expect(service.crear(NUEVO, 1)).rejects.toBeInstanceOf(ConflictError);
    expect(repos.creados).toHaveLength(0);
  });

  test('traduce una colisión del índice UNIQUE a un ConflictError', async () => {
    // Entre la comprobación previa y el INSERT pueden entrar dos altas
    // simultáneas con el mismo correo; la verdad la tiene la base.
    const repos = fakeRepos();
    repos.usuarios.crear = async () => {
      const err = new Error('Duplicate entry');
      err.code = 'ER_DUP_ENTRY';
      throw err;
    };
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await expect(service.crear(NUEVO, 1)).rejects.toBeInstanceOf(ConflictError);
  });

  test('rechaza una contraseña demasiado corta', async () => {
    const repos = fakeRepos();
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await expect(service.crear({ ...NUEVO, password: '1234' }, 1))
      .rejects.toBeInstanceOf(ValidationError);
  });

  test('rechaza un rol inventado', async () => {
    const repos = fakeRepos();
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await expect(service.crear({ ...NUEVO, rol: 'superadmin' }, 1))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

describe('usuarioService.actualizar — barrera del último administrador', () => {
  const unicoAdmin = { 1: { id: 1, nombre: 'Jefe', rol: 'admin', activo: 1 } };

  test('impide degradar al único administrador activo', async () => {
    const repos = fakeRepos({ usuarios: unicoAdmin, adminsActivosOtros: 0 });
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await expect(service.actualizar(1, { nombre: 'Jefe', rol: 'asesor', activo: '1' }, 1))
      .rejects.toBeInstanceOf(ConflictError);
    expect(repos.actualizados).toHaveLength(0);
  });

  test('impide desactivar al único administrador activo', async () => {
    const repos = fakeRepos({ usuarios: unicoAdmin, adminsActivosOtros: 0 });
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await expect(service.actualizar(1, { nombre: 'Jefe', rol: 'admin' }, 1))
      .rejects.toBeInstanceOf(ConflictError);
  });

  test('permite degradar a un admin si queda otro activo', async () => {
    const repos = fakeRepos({ usuarios: unicoAdmin, adminsActivosOtros: 1 });
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await service.actualizar(1, { nombre: 'Jefe', rol: 'asesor', activo: '1' }, 1);

    expect(repos.actualizados).toHaveLength(1);
    expect(repos.actualizados[0].datos.rol).toBe('asesor');
  });

  test('no estorba al editar a un asesor', async () => {
    const repos = fakeRepos({
      usuarios: { 2: { id: 2, nombre: 'Ana', rol: 'asesor', activo: 1 } },
      adminsActivosOtros: 0
    });
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await service.actualizar(2, { nombre: 'Ana María', rol: 'asesor', activo: '1' }, 1);

    expect(repos.actualizados[0].datos.nombre).toBe('Ana María');
  });
});

describe('usuarioService.actualizar — sesiones', () => {
  test('al desactivar una cuenta cierra sus sesiones abiertas', async () => {
    // Sin esto, alguien a quien acaban de sacar del equipo seguiría dentro
    // del panel hasta que venza su cookie — hasta 12 horas.
    const repos = fakeRepos({
      usuarios: { 2: { id: 2, nombre: 'Ana', rol: 'asesor', activo: 1 } }
    });
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await service.actualizar(2, { nombre: 'Ana', rol: 'asesor' }, 1);

    expect(repos.sesionesCerradas).toEqual([2]);
  });

  test('no cierra sesiones si la cuenta sigue activa', async () => {
    const repos = fakeRepos({
      usuarios: { 2: { id: 2, nombre: 'Ana', rol: 'asesor', activo: 1 } }
    });
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await service.actualizar(2, { nombre: 'Ana', rol: 'asesor', activo: '1' }, 1);

    expect(repos.sesionesCerradas).toHaveLength(0);
  });

  test('falla si el usuario no existe', async () => {
    const repos = fakeRepos({ usuarios: {} });
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    // Nombre válido a propósito: con uno inválido saltaría primero el
    // ValidationError y el test no probaría lo que dice probar.
    await expect(service.actualizar(99, { nombre: 'Nadie', rol: 'asesor', activo: '1' }, 1))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('usuarioService.resetearPassword', () => {
  test('delega en authService, que es quien hashea y cierra sesiones', async () => {
    const repos = fakeRepos({ usuarios: { 2: { id: 2, nombre: 'Ana', rol: 'asesor', activo: 1 } } });
    const auth = fakeAuth();
    const service = usuarioService({ repos, logger: fakeLogger(), auth });

    await service.resetearPassword(2, { password: 'otra-clave1', confirmacion: 'otra-clave1' }, 1);

    expect(auth.cambios).toHaveLength(1);
    expect(auth.cambios[0].id).toBe(2);
  });

  test('falla si el usuario no existe', async () => {
    const repos = fakeRepos({ usuarios: {} });
    const service = usuarioService({ repos, logger: fakeLogger(), auth: fakeAuth() });

    await expect(service.resetearPassword(99, {}, 1)).rejects.toBeInstanceOf(NotFoundError);
  });
});
