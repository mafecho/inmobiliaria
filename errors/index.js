// Errores de dominio: las rutas/servicios dicen QUÉ salió mal sin saber nada
// de HTTP, y middleware/errorHandler.js traduce eso a un status y un formato
// de respuesta. `expected: true` separa "condición prevista del negocio" de
// "esto es un bug" para no ensuciar los logs con stack traces de lo primero.
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.expected = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Datos inválidos') {
    super(message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'No encontrado') {
    super(message, 404);
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiados intentos. Espera unos minutos.') {
    super(message, 429);
  }
}

module.exports = { AppError, ValidationError, NotFoundError, TooManyRequestsError };
