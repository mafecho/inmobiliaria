-- Un solo formulario en toda la landing alimenta esta tabla. `tipo` dice qué
-- botón lo disparó (consignar, comprar, un servicio puntual) para que el
-- panel de Fase 2 pueda priorizar sin tener cinco tablas casi iguales.
CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(40) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  email VARCHAR(150) NULL,
  mensaje VARCHAR(1000) NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'nuevo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
