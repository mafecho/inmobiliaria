-- Catálogo de propiedades. Reemplaza el portafolio que estaba hardcodeado en
-- views/partials/destacados.ejs durante la Fase 1.
--
-- `precio` es BIGINT y no INT a propósito: en pesos colombianos, un INT con
-- signo se queda corto a partir de ~$2.147 millones, y una propiedad de
-- $2.500 millones es perfectamente normal. Se guarda como entero de pesos,
-- sin decimales, para no arrastrar errores de punto flotante en el dinero.
--
-- `direccion` es interna: la usa el asesor para identificar el inmueble y
-- NO se renderiza en el sitio público (ver views/propiedades/).
--
-- `estado` es el interruptor que pide el negocio: sólo 'disponible' aparece
-- en la web. 'borrador' permite cargar una propiedad a medias sin publicarla.
CREATE TABLE IF NOT EXISTS propiedades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(180) NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  operacion VARCHAR(20) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'borrador',
  zona VARCHAR(80) NOT NULL,
  direccion VARCHAR(200) NULL,
  precio BIGINT UNSIGNED NOT NULL,
  administracion BIGINT UNSIGNED NULL,
  habitaciones TINYINT UNSIGNED NULL,
  banos TINYINT UNSIGNED NULL,
  parqueaderos TINYINT UNSIGNED NULL,
  area_m2 DECIMAL(10,2) NULL,
  estrato TINYINT UNSIGNED NULL,
  descripcion TEXT NULL,
  destacada TINYINT(1) NOT NULL DEFAULT 0,
  creado_por INT NULL,
  actualizado_por INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_propiedades_slug (slug),
  KEY idx_propiedades_publicas (estado, operacion, tipo),
  KEY idx_propiedades_precio (precio),
  KEY idx_propiedades_destacada (estado, destacada),
  CONSTRAINT fk_propiedades_creado_por
    FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_propiedades_actualizado_por
    FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
