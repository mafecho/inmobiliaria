// Formateo para las vistas. Vive en services/ y no dentro de los templates
// para que "cómo se muestra un precio" se defina y se pruebe en un solo
// lugar, en vez de repetirse en cada .ejs.

// Intl con locale fijo 'es-CO': el servidor no debe formatear según su propia
// configuración regional, que en un hosting compartido es impredecible.
const PESOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

const NUMERO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

function precio(valor) {
  if (valor === null || valor === undefined || valor === '') return 'Consultar';
  return PESOS.format(Number(valor));
}

// Para las tarjetas, donde "$ 450.000.000" es largo y compite con el resto de
// la información. 450.000.000 -> "$450 M", 2.500.000.000 -> "$2.500 M".
//
// Por debajo de 10 millones se muestra un decimal a propósito: son los
// arriendos, y ahí redondear miente. Un arriendo de $2.200.000 como "$2 M" se
// come 200 mil pesos, que para quien busca arriendo es la diferencia entre
// entrar y no entrar en su presupuesto.
const UN_DECIMAL = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function precioCorto(valor) {
  if (valor === null || valor === undefined || valor === '') return 'Consultar';
  const n = Number(valor);

  if (n >= 1000000) {
    const millones = n / 1000000;
    return millones < 10
      ? '$' + UN_DECIMAL.format(millones) + ' M'
      : '$' + NUMERO.format(Math.round(millones)) + ' M';
  }
  if (n >= 1000) return '$' + NUMERO.format(Math.round(n / 1000)) + ' mil';
  return PESOS.format(n);
}

function area(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  // La columna es DECIMAL, y mysql2 la entrega como string: Number() antes de
  // formatear, o "110.00" se imprimiría tal cual.
  return NUMERO.format(Number(valor)) + ' m²';
}

// 'local-oficina' -> 'Local / Oficina'
const ETIQUETAS_TIPO = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  penthouse: 'Penthouse',
  lote: 'Lote',
  'local-oficina': 'Local / Oficina',
  finca: 'Finca',
  bodega: 'Bodega'
};

const ETIQUETAS_OPERACION = {
  venta: 'Venta',
  arriendo: 'Arriendo'
};

const ETIQUETAS_ESTADO = {
  borrador: 'Borrador',
  disponible: 'Disponible',
  reservada: 'Reservada',
  cerrada: 'Cerrada'
};

function tipo(valor) {
  return ETIQUETAS_TIPO[valor] || valor;
}

function operacion(valor) {
  return ETIQUETAS_OPERACION[valor] || valor;
}

function estado(valor) {
  return ETIQUETAS_ESTADO[valor] || valor;
}

function fecha(valor) {
  if (!valor) return '';
  return new Date(valor).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

module.exports = {
  precio,
  precioCorto,
  area,
  tipo,
  operacion,
  estado,
  fecha,
  ETIQUETAS_TIPO,
  ETIQUETAS_OPERACION,
  ETIQUETAS_ESTADO
};
