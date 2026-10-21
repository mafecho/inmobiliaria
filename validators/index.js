const { z } = require('zod');

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

module.exports = { leadSchema, TIPOS_LEAD };
