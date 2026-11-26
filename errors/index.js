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

// No autenticado: falta sesión, o las credenciales no son válidas. El mensaje
// por defecto es deliberadamente ambiguo — no distingue "ese correo no
// existe" de "la contraseña está mal" — para no confirmarle a nadie qué
// correos tienen cuenta en el panel.
class UnauthorizedError extends AppError {
  constructor(message = 'Correo o contraseña incorrectos') {
    super(message, 401);
  }
}

// Autenticado pero sin permiso: típicamente un asesor intentando algo que
// sólo puede hacer un administrador.
class ForbiddenError extends AppError {
  constructor(message = 'No tiene permiso para esta acción') {
    super(message, 403);
  }
}

// Choque con el estado actual: un correo ya registrado, un slug ocupado, o
// dejar el panel sin ningún administrador activo.
class ConflictError extends AppError {
  constructor(message = 'La operación entra en conflicto con los datos actuales') {
    super(message, 409);
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError
};
