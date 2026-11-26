const { z } = require('zod');

// ---------------------------------------------------------------------------
// Leads (Fase 1)
// ---------------------------------------------------------------------------

// Qué botón de la landing disparó el formulario único de contacto/lead.
const TIPOS_LEAD = [
  'consignar',
  'comprar',
  'arrendar',
  'asesoria-legal',
  'licencia-construccion',
  'planos-arquitectonicos',
  'planos-estructurales',
  'contacto'
];

const leadSchema = z.object({
  tipo: z.enum(TIPOS_LEAD),
  nombre: z.string().trim().min(2, 'El nombre es muy corto').max(150),
  telefono: z.string().trim().min(7, 'El teléfono es muy corto').max(30),
  email: z.union([z.string().trim().email().max(150), z.literal('')]).optional(),
  mensaje: z.string().trim().max(1000).optional()
});

// ---------------------------------------------------------------------------
// Vocabulario del catálogo (Fase 2)
// ---------------------------------------------------------------------------

const TIPOS_PROPIEDAD = ['apartamento', 'casa', 'penthouse', 'lote', 'local-oficina', 'finca', 'bodega'];
const OPERACIONES = ['venta', 'arriendo'];

// Sólo 'disponible' se publica en el sitio. 'borrador' deja cargar una
// propiedad a medias sin que salga al aire; 'reservada' y 'cerrada' la sacan
// de la web sin perder el histórico ni las fotos.
const ESTADOS_PROPIEDAD = ['borrador', 'disponible', 'reservada', 'cerrada'];
const ESTADO_PUBLICO = 'disponible';

const ROLES = ['admin', 'asesor'];

// Las zonas NO son una lista cerrada a propósito: el CLAUDE.md marca la zona
// de cobertura como pendiente de definir por el cliente, y hardcodear
// "Norte/Centro/Sur" sería inventar ese dato. Es texto libre, y el filtro del
// catálogo construye sus opciones con los valores que existan en la base
// (ver repositories/propiedadRepository.js → zonasPublicadas).

// Los formularios HTML mandan '' para un campo numérico vacío, y '450.000.000'
// cuando el asesor escribe el precio con separadores de miles. Esto normaliza
// las dos cosas antes de que zod valide.
const numeroOpcional = (max) =>
  z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return undefined;
    if (typeof v === 'string') {
      const limpio = v.replace(/[.\s,$]/g, '');
      if (limpio === '') return undefined;
      return Number(limpio);
    }
    return v;
  }, z.number().int().min(0).max(max).optional());

const dineroRequerido = z.preprocess((v) => {
  if (typeof v === 'string') {
    const limpio = v.replace(/[.\s,$]/g, '');
    return limpio === '' ? undefined : Number(limpio);
  }
  return v;
}, z.number({ message: 'El precio es obligatorio' }).int('El precio debe ser un número entero de pesos').min(1, 'El precio debe ser mayor a cero'));

const areaOpcional = z.preprocess((v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  if (typeof v === 'string') return Number(v.replace(/[\s,]/g, ''));
  return v;
}, z.number().min(0).max(999999).optional());

const propiedadSchema = z.object({
  titulo: z.string().trim().min(5, 'El título es muy corto').max(180),
  tipo: z.enum(TIPOS_PROPIEDAD, { message: 'Tipo de inmueble inválido' }),
  operacion: z.enum(OPERACIONES, { message: 'La operación debe ser venta o arriendo' }),
  estado: z.enum(ESTADOS_PROPIEDAD, { message: 'Estado inválido' }).default('borrador'),
  zona: z.string().trim().min(2, 'La zona es obligatoria').max(80),
  direccion: z.union([z.string().trim().max(200), z.literal('')]).optional(),
  precio: dineroRequerido,
  administracion: numeroOpcional(99999999999),
  habitaciones: numeroOpcional(255),
  banos: numeroOpcional(255),
  parqueaderos: numeroOpcional(255),
  area_m2: areaOpcional,
  estrato: numeroOpcional(6),
  descripcion: z.union([z.string().trim().max(5000), z.literal('')]).optional(),
  destacada: z.preprocess((v) => v === '1' || v === 'on' || v === true, z.boolean()).default(false)
});

// ---------------------------------------------------------------------------
// Cuentas y acceso
// ---------------------------------------------------------------------------

// 8 caracteres es el mínimo; no se exige una receta de símbolos porque obliga
// a patrones predecibles ("Clave2026!") sin ganar entropía real.
//
// El tope son 72 BYTES, no caracteres, y no es un número arbitrario: bcrypt
// ignora en silencio todo lo que pase de ese límite. Sin este control, dos
// contraseñas largas que compartan los primeros 72 bytes abrirían la misma
// cuenta, y el usuario nunca se enteraría. Se mide en bytes porque un
// carácter acentuado ocupa dos (contraseña = 10 caracteres, 11 bytes).
const BCRYPT_MAX_BYTES = 72;

const passwordSchema = z.string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= BCRYPT_MAX_BYTES, {
    message: 'La contraseña es demasiado larga (máximo 72 bytes)'
  });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido').max(190),
  password: z.string().min(1, 'La contraseña es obligatoria').max(200)
});

const usuarioCrearSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es muy corto').max(150),
  email: z.string().trim().toLowerCase().email('Correo inválido').max(190),
  password: passwordSchema,
  rol: z.enum(ROLES, { message: 'Rol inválido' }).default('asesor')
});

const usuarioEditarSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es muy corto').max(150),
  rol: z.enum(ROLES, { message: 'Rol inválido' }),
  activo: z.preprocess((v) => v === '1' || v === 'on' || v === true, z.boolean()).default(false)
});

const cambiarPasswordSchema = z.object({
  password: passwordSchema,
  confirmacion: z.string()
}).refine((d) => d.password === d.confirmacion, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmacion']
});

// ---------------------------------------------------------------------------
// Filtros del catálogo público (query string, todo opcional)
// ---------------------------------------------------------------------------

const vacioAUndefined = (v) => (v === '' || v === null ? undefined : v);

const filtrosSchema = z.object({
  tipo: z.preprocess(vacioAUndefined, z.enum(TIPOS_PROPIEDAD).optional()),
  operacion: z.preprocess(vacioAUndefined, z.enum(OPERACIONES).optional()),
  zona: z.preprocess(vacioAUndefined, z.string().trim().max(80).optional()),
  precioMin: numeroOpcional(99999999999),
  precioMax: numeroOpcional(99999999999),
  habitaciones: numeroOpcional(255),
  pagina: z.preprocess((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : 1;
  }, z.number().int().min(1).max(500))
});

module.exports = {
  leadSchema,
  TIPOS_LEAD,
  propiedadSchema,
  TIPOS_PROPIEDAD,
  OPERACIONES,
  ESTADOS_PROPIEDAD,
  ESTADO_PUBLICO,
  ROLES,
  loginSchema,
  usuarioCrearSchema,
  usuarioEditarSchema,
  cambiarPasswordSchema,
  filtrosSchema
};
