-- Galería de cada propiedad. `archivo` guarda sólo el nombre del archivo, no
-- una ruta: dónde viven físicamente las fotos lo decide config.uploads.dir,
-- que en producción apunta FUERA del docroot para que `git reset --hard` del
-- deploy no pueda rozarlas. Guardar la ruta completa amarraría la base a una
-- ubicación del disco.
--
-- La foto principal es la de menor `orden`, no una columna booleana: con un
-- flag habría que garantizar "exactamente una en true" por propiedad, y eso
-- en SQL son disparadores o índices parciales que MySQL no tiene.
--
-- ON DELETE CASCADE: borrar la propiedad borra sus filas de fotos. Los
-- archivos en disco los borra services/fotoService.js, que es quien sabe de
-- disco; la base nunca toca el sistema de archivos.
CREATE TABLE IF NOT EXISTS propiedad_fotos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  propiedad_id INT NOT NULL,
  archivo VARCHAR(200) NOT NULL,
  alt VARCHAR(200) NULL,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fotos_propiedad (propiedad_id, orden),
  CONSTRAINT fk_fotos_propiedad
    FOREIGN KEY (propiedad_id) REFERENCES propiedades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
