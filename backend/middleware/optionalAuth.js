const { authenticateRequestToken } = require('./authMiddleware');

function requireAuthIfEnabled(request, response, next) {
  if (process.env.ENFORCE_AUTH !== 'true') {
    return next();
  }

  return authenticateRequestToken(request, response, next);
}

module.exports = {
  requireAuthIfEnabled,
};
