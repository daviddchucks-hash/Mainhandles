// Centralized error handler so every route can just call next(err).
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  const message = status === 500 ? 'Something went wrong. Please try again.' : err.message;
  res.status(status).json({ error: message });
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

module.exports = { errorHandler, notFound };
