const bcrypt = require('bcryptjs');

const authService = require('../services/authService');
const { UnauthorizedError, ValidationError } = require('../errors');

// bcrypt real, no simulado: lo que se prueba acá incluye que el hash y la
// comparación funcionen de verdad. Con rounds=10 son ~90ms por operación, así
// que el hash de la cuenta de prueba se calcula una sola vez para todo el
// archivo.

const PASSWORD = 'clavesegura123';
let hashValido;

beforeAll(async () => {
  hashValido = await bcrypt.hash(PASSWORD, 10);
});

function fakeLogger() {
  const avisos = [];
  return {
    avisos,
    info: () => {},
    debug: () => {},
    warn: (m, c) => avisos.push({ m, c }),
    excepcion: () => {}
  };
}

function fakeRepos(usuario) {
  const accesos = [];
  const passwords = [];
  const sesionesCerradas = [];

  return {
    accesos,
    passwords,
    sesionesCerradas,
    usuarios: {
      async porEmailParaLogin() { return usuario; },
      async registrarAcceso(id) { accesos.push(id); },
      async cambiarPassword(id, hash) { passwords.push({ id, hash }); return 1; }
    },
    sesiones: {
      async eliminarDeUsuario(id) { sesionesCerradas.push(id); return 1; }
    }
  };
}

const ACTIVO = () => ({
  id: 3,
  nombre: 'Ana Gómez',
  email: 'ana@echavarria-gi.com',
  password_hash: hashValido,
  rol: 'asesor',
  activo: 1
});

describe('authService.autenticar', () => {
  test('acepta las credenciales correctas y devuelve sólo datos seguros', async () => {
    const repos = fakeRepos(ACTIVO());
    const service = authService({ repos, logger: fakeLogger() });

    const sesion = await service.autenticar({
      email: 'ana@echavarria-gi.com', password: PASSWORD
    });

    expect(sesion).toEqual({
      usuarioId: 3,
      nombre: 'Ana Gómez',
      email: 'ana@echavarria-gi.com',
      rol: 'asesor'
    });
    // Lo que va a la sesión nunca debe incluir el hash.
    expect(sesion.password_hash).toBeUndefined();
    expect(repos.accesos).toEqual([3]);
  });

  test('normaliza el correo: mayúsculas y espacios no impiden entrar', async () => {
    const repos = fakeRepos(ACTIVO());
    const service = authService({ repos, logger: fakeLogger() });

    const sesion = await service.autenticar({
      email: '  ANA@Echavarria-GI.com  ', password: PASSWORD
    });

    expect(sesion.usuarioId).toBe(3);
  });

  test('rechaza una contraseña incorrecta', async () => {
    const repos = fakeRepos(ACTIVO());
    const service = authService({ repos, logger: fakeLogger() });

    await expect(service.autenticar({
      email: 'ana@echavarria-gi.com', password: 'otra-cosa'
    })).rejects.toBeInstanceOf(UnauthorizedError);

    expect(repos.accesos).toHaveLength(0);
  });

  test('rechaza un correo inexistente con el MISMO mensaje que una clave mala', async () => {
    // No debe poderse distinguir "ese correo no tiene cuenta" de "la clave
    // está mal": si se distingue, se puede averiguar qué correos tienen
    // acceso al panel probando uno por uno.
    const sinUsuario = authService({ repos: fakeRepos(null), logger: fakeLogger() });
    const conUsuario = authService({ repos: fakeRepos(ACTIVO()), logger: fakeLogger() });

    const errNoExiste = await sinUsuario
      .autenticar({ email: 'nadie@ejemplo.com', password: 'loquesea1' })
      .catch((e) => e);
    const errClaveMala = await conUsuario
      .autenticar({ email: 'ana@echavarria-gi.com', password: 'loquesea1' })
      .catch((e) => e);

    expect(errNoExiste.message).toBe(errClaveMala.message);
    expect(errNoExiste.statusCode).toBe(errClaveMala.statusCode);
  });

  test('no deja entrar a una cuenta desactivada aunque la clave sea correcta', async () => {
    const repos = fakeRepos({ ...ACTIVO(), activo: 0 });
    const service = authService({ repos, logger: fakeLogger() });

    await expect(service.autenticar({
      email: 'ana@echavarria-gi.com', password: PASSWORD
    })).rejects.toThrow(/desactivada/i);

    expect(repos.accesos).toHaveLength(0);
  });

  test('un correo con formato inválido no revela que lo es', async () => {
    const service = authService({ repos: fakeRepos(null), logger: fakeLogger() });

    const err = await service.autenticar({ email: 'no-es-un-correo', password: 'x' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.message).toBe('Correo o contraseña incorrectos');
  });
});

describe('authService.cambiarPassword', () => {
  test('guarda un hash, nunca la contraseña en claro', async () => {
    const repos = fakeRepos(ACTIVO());
    const service = authService({ repos, logger: fakeLogger() });

    await service.cambiarPassword(3, {
      password: 'nuevaclave123', confirmacion: 'nuevaclave123'
    });

    expect(repos.passwords).toHaveLength(1);
    const { hash } = repos.passwords[0];
    expect(hash).not.toContain('nuevaclave123');
    expect(hash.startsWith('$2')).toBe(true);
    expect(await bcrypt.compare('nuevaclave123', hash)).toBe(true);
  });

  test('cierra las sesiones abiertas de esa cuenta', async () => {
    // Si la contraseña se cambió porque alguien más la tenía, dejar sus
    // cookies vivas no arregla nada.
    const repos = fakeRepos(ACTIVO());
    const service = authService({ repos, logger: fakeLogger() });

    await service.cambiarPassword(3, {
      password: 'nuevaclave123', confirmacion: 'nuevaclave123'
    });

    expect(repos.sesionesCerradas).toEqual([3]);
  });

  test('rechaza cuando la confirmación no coincide', async () => {
    const repos = fakeRepos(ACTIVO());
    const service = authService({ repos, logger: fakeLogger() });

    await expect(service.cambiarPassword(3, {
      password: 'nuevaclave123', confirmacion: 'otra'
    })).rejects.toBeInstanceOf(ValidationError);

    expect(repos.passwords).toHaveLength(0);
  });

  test('rechaza una contraseña de más de 72 bytes, que bcrypt truncaría', async () => {
    // Sin este tope, dos contraseñas largas que compartan los primeros 72
    // bytes abrirían la misma cuenta.
    const repos = fakeRepos(ACTIVO());
    const service = authService({ repos, logger: fakeLogger() });
    const larga = 'a'.repeat(73);

    await expect(service.cambiarPassword(3, {
      password: larga, confirmacion: larga
    })).rejects.toBeInstanceOf(ValidationError);
  });

  test('cuenta bytes y no caracteres: los acentos ocupan dos', async () => {
    const repos = fakeRepos(ACTIVO());
    const service = authService({ repos, logger: fakeLogger() });
    // 40 caracteres, 80 bytes en UTF-8.
    const acentuada = 'á'.repeat(40);

    await expect(service.cambiarPassword(3, {
      password: acentuada, confirmacion: acentuada
    })).rejects.toBeInstanceOf(ValidationError);
  });
});
