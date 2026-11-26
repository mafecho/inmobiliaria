const bcrypt = require('bcryptjs');

const { loginSchema, cambiarPasswordSchema } = require('../validators');
const { ValidationError, UnauthorizedError } = require('../errors');

// Autenticación del panel. El hash vive acá y no en el repositorio porque
// "cómo se protege una contraseña" es una regla de negocio, no una consulta.
//
// 10 rondas: ~90ms por verificación con bcryptjs puro. Subirlo encarece el
// login en un hosting compartido sin CPU de sobra; bajarlo abarata un ataque
// por fuerza bruta contra un volcado de la base. Con el límite de intentos de
// routes/auth.js, 10 es un punto razonable.
const ROUNDS = 10;

function authService({ repos, logger }) {
  // Hash de descarte, calculado una vez por proceso. Sirve para que un correo
  // inexistente consuma el mismo tiempo que uno real: sin esto, la diferencia
  // de latencia entre "no existe" (respuesta inmediata) y "existe pero la
  // clave está mal" (~90ms de bcrypt) permite averiguar qué correos tienen
  // cuenta en el panel probando uno por uno.
  const hashDeDescarte = bcrypt.hashSync('cuenta-inexistente', ROUNDS);

  return {
    async hashear(password) {
      return bcrypt.hash(password, ROUNDS);
    },

    async autenticar(input) {
      const parsed = loginSchema.safeParse(input);
      if (!parsed.success) {
        // Un correo mal formado no merece un mensaje distinto: decir "correo
        // inválido" vs "credenciales incorrectas" ya es información.
        throw new UnauthorizedError();
      }

      const { email, password } = parsed.data;
      const usuario = await repos.usuarios.porEmailParaLogin(email);

      // Siempre se compara, exista o no la cuenta (ver hashDeDescarte).
      const hash = usuario ? usuario.password_hash : hashDeDescarte;
      const coincide = await bcrypt.compare(password, hash);

      if (!usuario || !coincide) {
        logger.warn('Intento de acceso fallido', { email });
        throw new UnauthorizedError();
      }

      if (!usuario.activo) {
        // Mensaje distinto a propósito: acá ya demostró saber la contraseña,
        // así que no se le está revelando nada que no supiera, y necesita
        // entender por qué no entra en vez de creer que se equivocó de clave.
        logger.warn('Acceso de cuenta desactivada', { email, usuarioId: usuario.id });
        throw new UnauthorizedError('Esta cuenta está desactivada. Contacte al administrador.');
      }

      await repos.usuarios.registrarAcceso(usuario.id);
      logger.info('Acceso al panel', { usuarioId: usuario.id, rol: usuario.rol });

      // Lo que se guarda en la sesión: nunca el hash, nunca la fila completa.
      return {
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      };
    },

    // Cambio de contraseña propia o impuesto por un admin. Valida con el
    // mismo schema que el alta para que el tope de 72 bytes de bcrypt se
    // aplique en los dos caminos.
    async cambiarPassword(usuarioId, input) {
      const parsed = cambiarPasswordSchema.safeParse(input);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message || 'Datos inválidos');
      }

      const hash = await bcrypt.hash(parsed.data.password, ROUNDS);
      await repos.usuarios.cambiarPassword(usuarioId, hash);

      // Cerrar las demás sesiones del usuario: si la contraseña se cambió
      // porque alguien la tenía, dejar sus cookies vivas no arregla nada.
      await repos.sesiones.eliminarDeUsuario(usuarioId);
      logger.info('Contraseña actualizada', { usuarioId });
    }
  };
}

module.exports = authService;
module.exports.ROUNDS = ROUNDS;
