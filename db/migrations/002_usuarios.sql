-- Cuentas del panel de administración. No hay registro público: la primera
-- cuenta la crea scripts/crear-admin.js y de ahí en adelante un rol 'admin'
-- crea las demás desde el panel.
--
-- `rol` y `activo` son VARCHAR/TINYINT en vez de ENUM por consistencia con
-- `leads.tipo` y `leads.estado`: el conjunto válido vive en validators/ (zod),
-- donde se puede cambiar sin un ALTER TABLE.
--
-- email en 190 y no 255: con utf8mb4 el índice de MySQL admite hasta 191
-- caracteres por columna indexada.
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'asesor',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acceso TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
