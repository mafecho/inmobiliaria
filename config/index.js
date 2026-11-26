// Fuente única de configuración: nadie más lee process.env directamente.
// Mismo patrón que enelmapa (ver su config/index.js), simplificado porque acá
// no hay multi-tenancy ni superadmin.

const path = require('path');

const DEFAULT_DOMAIN = 'echavarria-gi.com';
const DEFAULT_PORT = 3000;
const DEFAULT_RATE_WINDOW_MIN = 15;
const DEFAULT_CONTACT_MAX = 10;
const DEFAULT_LOGIN_MAX = 8;
const DEFAULT_SESION_HORAS = 12;
const DEFAULT_UPLOAD_MB = 6;
const DEFAULT_UPLOAD_FOTOS = 20;
const SECRETO_DEV = 'solo-para-desarrollo-local-no-usar-en-produccion';

function intOrDefault(valor, porDefecto) {
  if (valor === undefined || valor === '') return porDefecto;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : porDefecto;
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  // En producción exigimos un secreto real. Si falta, NO se tumba el proceso
  // (la landing no tiene por qué caerse por eso): el panel responde 503 y el
  // sitio público sigue sirviendo. Ver middleware/requireAuth.js.
  //
  // Tampoco se genera uno aleatorio por proceso: bajo Passenger corren varios
  // workers, y cada uno firmaría las cookies con un secreto distinto, así que
  // la sesión se caería al azar según qué worker atienda cada petición.
  const sessionSecret = env.SESSION_SECRET || (isProduction ? '' : SECRETO_DEV);

  return {
    nodeEnv,
    isProduction,
    port: Number(env.PORT) || DEFAULT_PORT,
    domain: env.DOMAIN || DEFAULT_DOMAIN,
    db: {
      host: env.DB_HOST || 'localhost',
      user: env.DB_USER || 'root',
      password: env.DB_PASS || '',
      database: env.DB_NAME || 'echavarria'
    },
    // Sin default real a propósito: todavía no hay un WhatsApp/correo
    // definitivo de Echavarría Grupo Inmobiliario. La vista oculta el botón
    // de WhatsApp cuando viene vacío en vez de mostrar un contacto inventado.
    contacto: {
      whatsapp: env.CONTACTO_WHATSAPP || '',
      email: env.CONTACTO_EMAIL || ''
    },
    session: {
      secret: sessionSecret,
      habilitado: sessionSecret.length > 0,
      maxAgeMs: intOrDefault(env.SESSION_HORAS, DEFAULT_SESION_HORAS) * 60 * 60 * 1000
    },
    uploads: {
      // En producción esto DEBE apuntar fuera del docroot: deploy.sh corre
      // `git reset --hard` en cada despliegue, y aunque git no borra archivos
      // sin trackear, dejar el inventario fotográfico dentro del árbol del
      // repo es pedirle a un `git clean` futuro que se lo lleve.
      dir: env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads'),
      maxBytes: intOrDefault(env.UPLOAD_MAX_MB, DEFAULT_UPLOAD_MB) * 1024 * 1024,
      maxPorPropiedad: intOrDefault(env.UPLOAD_MAX_FOTOS, DEFAULT_UPLOAD_FOTOS)
    },
    log: {
      level: env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
      silent: env.LOG_SILENT === 'true'
    },
    rateLimit: {
      windowMs: intOrDefault(env.RATE_LIMIT_WINDOW_MIN, DEFAULT_RATE_WINDOW_MIN) * 60 * 1000,
      contactMax: intOrDefault(env.RATE_LIMIT_CONTACT_MAX, DEFAULT_CONTACT_MAX),
      loginMax: intOrDefault(env.RATE_LIMIT_LOGIN_MAX, DEFAULT_LOGIN_MAX)
    }
  };
}

module.exports = { loadConfig };
