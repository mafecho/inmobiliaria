// Logger deliberadamente chico: niveles, marca de tiempo y contexto, sin
// transporte a archivo — bajo Passenger, stdout/stderr ya van al log del
// servidor.
const NIVELES = { error: 0, warn: 1, info: 2, debug: 3 };
const SALIDA = { error: 'error', warn: 'warn', info: 'log', debug: 'log' };

function createLogger({ level = 'info', silent = false } = {}) {
  const umbral = NIVELES[level] ?? NIVELES.info;

  function escribir(nivel, mensaje, contexto) {
    if (silent || NIVELES[nivel] > umbral) return;

    const partes = [new Date().toISOString(), nivel.toUpperCase(), mensaje];
    if (contexto && Object.keys(contexto).length > 0) {
      partes.push(JSON.stringify(contexto));
    }

    console[SALIDA[nivel]](partes.join(' '));
  }

  return {
    error: (mensaje, contexto) => escribir('error', mensaje, contexto),
    warn: (mensaje, contexto) => escribir('warn', mensaje, contexto),
    info: (mensaje, contexto) => escribir('info', mensaje, contexto),
    debug: (mensaje, contexto) => escribir('debug', mensaje, contexto),
    excepcion: (mensaje, err, contexto) => {
      if (silent) return;
      escribir('error', mensaje, contexto);
      console.error(err);
    }
  };
}

module.exports = { createLogger, NIVELES };
