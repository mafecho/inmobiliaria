-- Store de sesiones de express-session.
--
-- Se escribió a mano en vez de usar express-mysql-session porque ese paquete
-- fija mysql2 en la versión 3.10.2 exacta, que arrastra dos vulnerabilidades
-- altas (GHSA-3f6p-5ww8-9rcr y GHSA-rgwj-5xj2-c3m3) y no se puede actualizar
-- sin que el paquete lo haga. Además abría su propio pool de conexiones, en
-- contra del principio de container.js de que las dependencias se arman en un
-- solo lugar. El store propio usa el pool que ya existe — ver
-- repositories/sesionRepository.js y services/sessionStore.js.
--
-- `expires` es BIGINT (milisegundos epoch) y no DATETIME para comparar contra
-- Date.now() sin convertir zonas horarias en cada consulta.
CREATE TABLE IF NOT EXISTS sesiones (
  sid VARCHAR(128) NOT NULL,
  expires BIGINT UNSIGNED NOT NULL,
  data MEDIUMTEXT NULL,
  PRIMARY KEY (sid),
  KEY idx_sesiones_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
