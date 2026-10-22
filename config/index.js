// Fuente única de configuración: nadie más lee process.env directamente.
// Mismo patrón que enelmapa (ver su config/index.js), simplificado porque acá
// no hay multi-tenancy, sesiones ni superadmin — Fase 1 es una sola landing.

const DEFAULT_DOMAIN = 'vivantia.enelmapa.co';
const DEFAULT_PORT = 3000;
const DEFAULT_RATE_WINDOW_MIN = 15;
const DEFAULT_CONTACT_MAX = 10;

function intOrDefault(valor, porDefecto) {
  if (valor === undefined || valor === '') return porDefecto;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : porDefecto;
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  return {
    nodeEnv,
    isProduction,
    port: Number(env.PORT) || DEFAULT_PORT,
    domain: env.DOMAIN || DEFAULT_DOMAIN,
    db: {
      host: env.DB_HOST || 'localhost',
      user: env.DB_USER || 'root',
      password: env.DB_PASS || '',
      database: env.DB_NAME || 'vivantia'
    },
    // Sin default real a propósito: todavía no hay un WhatsApp/correo
    // definitivo de Echavarría Grupo Inmobiliario. La vista oculta el botón
    // de WhatsApp cuando viene vacío en vez de mostrar un contacto inventado.
    contacto: {
      whatsapp: env.CONTACTO_WHATSAPP || '',
      email: env.CONTACTO_EMAIL || ''
    },
    log: {
      level: env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
      silent: env.LOG_SILENT === 'true'
    },
    rateLimit: {
      windowMs: intOrDefault(env.RATE_LIMIT_WINDOW_MIN, DEFAULT_RATE_WINDOW_MIN) * 60 * 1000,
      contactMax: intOrDefault(env.RATE_LIMIT_CONTACT_MAX, DEFAULT_CONTACT_MAX)
    }
  };
}

module.exports = { loadConfig };
