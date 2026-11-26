const { Store } = require('express-session');

// Store de sesiones propio, sobre el pool que ya arma container.js.
//
// Se escribió en vez de usar express-mysql-session por dos razones concretas:
//
//   1. Ese paquete fija `mysql2` en la versión 3.10.2 exacta (no un rango),
//      que arrastra dos vulnerabilidades altas — GHSA-3f6p-5ww8-9rcr, fuga de
//      credenciales en texto plano por degradación del plugin de auth, y
//      GHSA-rgwj-5xj2-c3m3, bomba de descompresión. Al estar fijada, no se
//      puede parchear sin que el paquete publique una versión nueva.
//   2. Abría su propio pool de conexiones, en contra del principio de
//      container.js: las dependencias se arman en un solo lugar.
//
// La interfaz que express-session necesita son cuatro métodos. El SQL vive en
// repositories/sesionRepository.js, como el del resto del proyecto.
//
// Todos los callbacks se invocan con (err) o (err, resultado), que es el
// contrato de express-session; por eso los async se envuelven acá y no se
// deja escapar una promesa rechazada.

const LIMPIEZA_CADA_MS = 15 * 60 * 1000;

class SesionStore extends Store {
  constructor({ repo, logger, maxAgeMs }) {
    super();
    this.repo = repo;
    this.logger = logger;
    this.maxAgeMs = maxAgeMs;
    this.temporizador = null;
  }

  // Vencimiento de ESTA sesión: express permite cookies con maxAge propio,
  // así que se respeta el de la sesión si viene y se cae al global si no.
  vencimiento(session) {
    const propio = session && session.cookie && session.cookie.expires;
    if (propio) return new Date(propio).getTime();
    return Date.now() + this.maxAgeMs;
  }

  get(sid, callback) {
    this.repo.obtener(sid).then((fila) => {
      if (!fila) return callback(null, null);

      // Vencida pero todavía en la tabla: se trata como inexistente y se
      // borra. La limpieza periódica es un respaldo, no la única defensa.
      if (Number(fila.expires) < Date.now()) {
        return this.repo.eliminar(sid)
          .then(() => callback(null, null))
          .catch((err) => callback(err));
      }

      try {
        return callback(null, JSON.parse(fila.data));
      } catch (err) {
        // Dato corrupto: mejor forzar una sesión nueva que tumbar la petición.
        this.logger.warn('Sesión ilegible, se descarta', { sid });
        return this.repo.eliminar(sid)
          .then(() => callback(null, null))
          .catch((e) => callback(e));
      }
    }).catch((err) => callback(err));
  }

  set(sid, session, callback) {
    let data;
    try {
      data = JSON.stringify(session);
    } catch (err) {
      return callback(err);
    }

    return this.repo.guardar(sid, data, this.vencimiento(session))
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  touch(sid, session, callback) {
    this.repo.tocar(sid, this.vencimiento(session))
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  destroy(sid, callback) {
    this.repo.eliminar(sid)
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  length(callback) {
    this.repo.contar()
      .then((total) => callback(null, total))
      .catch((err) => callback(err));
  }

  // Barrido periódico de sesiones vencidas. unref() para que el temporizador
  // no mantenga vivo el proceso: sin eso, `npm test` o un Ctrl-C quedarían
  // colgados esperando un intervalo que nunca termina.
  iniciarLimpieza() {
    if (this.temporizador) return;

    this.temporizador = setInterval(() => {
      this.repo.limpiarVencidas()
        .then((borradas) => {
          if (borradas > 0) {
            this.logger.debug('Sesiones vencidas eliminadas', { borradas });
          }
        })
        .catch((err) => {
          this.logger.warn('No se pudieron limpiar las sesiones vencidas', {
            motivo: err.message
          });
        });
    }, LIMPIEZA_CADA_MS);

    if (typeof this.temporizador.unref === 'function') {
      this.temporizador.unref();
    }
  }

  detenerLimpieza() {
    if (this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }
}

module.exports = { SesionStore, LIMPIEZA_CADA_MS };
