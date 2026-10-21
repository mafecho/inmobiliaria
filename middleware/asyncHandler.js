// Express 4 no atrapa promesas rechazadas: si un handler async lanza, la
// request se cuelga sin responder. Esto redirige el throw a next(err).
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
