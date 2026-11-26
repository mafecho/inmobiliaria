const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const { ValidationError, NotFoundError, ConflictError } = require('../errors');

// Único lugar del proyecto que sabe de disco. La base guarda sólo el nombre
// del archivo; la carpeta la decide config.uploads.dir.
//
// Tres reglas de seguridad que no son opcionales acá:
//
//   1. El nombre del archivo lo generamos nosotros, aleatorio. El nombre que
//      manda el navegador es dato del atacante: puede traer "../" o
//      ".htaccess" o 300 caracteres. Nunca se usa, ni siquiera "sanitizado".
//   2. El tipo se verifica leyendo los primeros bytes del archivo ya escrito,
//      no por su extensión ni por el Content-Type, que los pone el cliente.
//      Un .php renombrado a .jpg declara image/jpeg sin problema.
//   3. Al borrar, la ruta se reconstruye desde la carpeta configurada y se
//      comprueba que el resultado siga dentro de ella. Si una fila de la base
//      llegara a tener "../../server.js", el borrado se rechaza.

const FIRMAS = [
  { ext: '.jpg', mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { ext: '.png', mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { ext: '.gif', mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }
];

// WebP no se reconoce por un prefijo fijo: es "RIFF" + 4 bytes de tamaño +
// "WEBP", así que se comprueba aparte.
function esWebp(buf) {
  return buf.length >= 12
    && buf.toString('ascii', 0, 4) === 'RIFF'
    && buf.toString('ascii', 8, 12) === 'WEBP';
}

function detectarTipo(buf) {
  const firma = FIRMAS.find((f) => f.bytes.every((b, i) => buf[i] === b));
  if (firma) return firma;
  if (esWebp(buf)) return { ext: '.webp', mime: 'image/webp' };
  return null;
}

function fotoService({ repos, logger, config }) {
  const dir = config.uploads.dir;

  // La carpeta se crea al arrancar y no en la primera subida: si falla por
  // permisos, es mejor enterarse en el log del arranque que cuando un asesor
  // está intentando publicar.
  function asegurarCarpeta() {
    try {
      fs.mkdirSync(dir, { recursive: true });
      return true;
    } catch (err) {
      logger.excepcion('No se pudo preparar la carpeta de fotos: ' + dir, err);
      return false;
    }
  }

  function rutaDe(archivo) {
    const resuelta = path.resolve(dir, archivo);
    const base = path.resolve(dir);
    // path.resolve normaliza "..", así que esto detecta cualquier intento de
    // salirse de la carpeta configurada.
    if (resuelta !== base && !resuelta.startsWith(base + path.sep)) {
      throw new ValidationError('Ruta de archivo inválida');
    }
    return resuelta;
  }

  async function borrarArchivo(archivo) {
    try {
      await fsp.unlink(rutaDe(archivo));
    } catch (err) {
      // Que el archivo ya no esté no es un error: el objetivo era que no
      // estuviera. Cualquier otra cosa sí se registra.
      if (err.code !== 'ENOENT') {
        logger.warn('No se pudo borrar una foto del disco', {
          archivo, motivo: err.message
        });
      }
    }
  }

  const almacenamiento = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      // Extensión provisional a partir del tipo declarado; la definitiva la
      // decide la verificación por bytes. Si el tipo declarado no está en la
      // lista, se rechaza antes de escribir nada.
      const declarado = FIRMAS.find((f) => f.mime === file.mimetype);
      const ext = declarado ? declarado.ext : (file.mimetype === 'image/webp' ? '.webp' : null);
      if (!ext) {
        return cb(new ValidationError('Sólo se aceptan imágenes JPG, PNG, WebP o GIF'));
      }
      return cb(null, crypto.randomBytes(16).toString('hex') + ext);
    }
  });

  const subida = multer({
    storage: almacenamiento,
    limits: {
      fileSize: config.uploads.maxBytes,
      files: config.uploads.maxPorPropiedad
    }
  });

  return {
    asegurarCarpeta,
    rutaDe,

    // Middleware de Express para el formulario de la galería.
    middlewareSubida: subida.array('fotos', config.uploads.maxPorPropiedad),

    // Verifica los archivos ya escritos por multer y los registra en la base.
    // Los que no pasen la verificación se borran del disco.
    async registrar(propiedadId, archivos) {
      if (!archivos || archivos.length === 0) {
        throw new ValidationError('No se recibió ninguna imagen');
      }

      const yaTiene = await repos.fotos.contarDeLaPropiedad(propiedadId);
      const cupo = config.uploads.maxPorPropiedad - yaTiene;
      if (cupo <= 0) {
        await Promise.all(archivos.map((a) => borrarArchivo(a.filename)));
        throw new ConflictError(
          `Esta propiedad ya tiene el máximo de ${config.uploads.maxPorPropiedad} fotos`
        );
      }

      const aceptados = [];
      const rechazados = [];

      for (const archivo of archivos) {
        if (aceptados.length >= cupo) {
          rechazados.push(archivo);
          continue;
        }

        let descriptor;
        try {
          // eslint-disable-next-line no-await-in-loop
          descriptor = await fsp.open(rutaDe(archivo.filename), 'r');
          const buf = Buffer.alloc(12);
          // eslint-disable-next-line no-await-in-loop
          await descriptor.read(buf, 0, 12, 0);
          // eslint-disable-next-line no-await-in-loop
          await descriptor.close();
          descriptor = null;

          if (detectarTipo(buf)) {
            aceptados.push(archivo);
          } else {
            logger.warn('Archivo rechazado: no es una imagen real', {
              declarado: archivo.mimetype
            });
            rechazados.push(archivo);
          }
        } catch (err) {
          if (descriptor) await descriptor.close().catch(() => {});
          logger.warn('No se pudo verificar un archivo subido', { motivo: err.message });
          rechazados.push(archivo);
        }
      }

      await Promise.all(rechazados.map((a) => borrarArchivo(a.filename)));

      if (aceptados.length === 0) {
        throw new ValidationError(
          'Ninguno de los archivos es una imagen válida (JPG, PNG, WebP o GIF)'
        );
      }

      let orden = await repos.fotos.siguienteOrden(propiedadId);
      const ids = [];
      for (const archivo of aceptados) {
        // eslint-disable-next-line no-await-in-loop
        const id = await repos.fotos.agregar({
          propiedadId,
          archivo: archivo.filename,
          alt: null,
          orden
        });
        ids.push(id);
        orden += 1;
      }

      logger.info('Fotos agregadas', {
        propiedadId, aceptadas: aceptados.length, rechazadas: rechazados.length
      });

      return { agregadas: ids.length, rechazadas: rechazados.length };
    },

    async eliminar(fotoId, propiedadId) {
      const foto = await repos.fotos.porId(fotoId);
      if (!foto || foto.propiedad_id !== propiedadId) {
        throw new NotFoundError('Foto no encontrada');
      }

      await repos.fotos.eliminar(fotoId);
      await borrarArchivo(foto.archivo);
      logger.info('Foto eliminada', { fotoId, propiedadId });
    },

    // La usa propiedadService al borrar una propiedad. Las filas se van solas
    // por el ON DELETE CASCADE, pero los archivos no: el disco no sabe nada
    // de claves foráneas.
    async eliminarTodasDe(propiedadId) {
      const galeria = await repos.fotos.deLaPropiedad(propiedadId);
      await Promise.all(galeria.map((f) => borrarArchivo(f.archivo)));
      return galeria.length;
    },

    async reordenar(propiedadId, idsEnOrden) {
      const galeria = await repos.fotos.deLaPropiedad(propiedadId);
      const propios = new Set(galeria.map((f) => f.id));

      const ids = idsEnOrden.map(Number).filter((id) => propios.has(id));
      if (ids.length !== galeria.length) {
        throw new ValidationError('El orden recibido no coincide con la galería');
      }

      await repos.fotos.reordenar(propiedadId, ids);
      logger.info('Galería reordenada', { propiedadId });
    },

    // Mover una foto al primer puesto. Es la única operación de orden que el
    // negocio necesita de verdad —elegir qué imagen se ve en el catálogo y al
    // compartir el enlace— y se resuelve con un POST, sin arrastrar nada ni
    // depender de JavaScript en el navegador.
    async hacerPortada(propiedadId, fotoId) {
      const galeria = await repos.fotos.deLaPropiedad(propiedadId);
      const elegida = galeria.find((f) => f.id === fotoId);
      if (!elegida) throw new NotFoundError('Foto no encontrada');

      const resto = galeria.filter((f) => f.id !== fotoId).map((f) => f.id);
      await repos.fotos.reordenar(propiedadId, [fotoId, ...resto]);
      logger.info('Portada cambiada', { propiedadId, fotoId });
    }
  };
}

module.exports = fotoService;
module.exports.detectarTipo = detectarTipo;
