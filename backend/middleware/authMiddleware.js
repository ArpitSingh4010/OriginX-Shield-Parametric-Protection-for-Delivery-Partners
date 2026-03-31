const jwt = require('jsonwebtoken');

const DEFAULT_AUTH_HEADER_PREFIX = 'Bearer ';

function authenticateRequestToken(request, response, next) {
  const authHeaderValue = request.headers.authorization || '';

  if (!authHeaderValue.startsWith(DEFAULT_AUTH_HEADER_PREFIX)) {
    return response.status(401).json({
      success: false,
      message: 'Authorization token is required.',
    });
  }

  const token = authHeaderValue.slice(DEFAULT_AUTH_HEADER_PREFIX.length).trim();
  const jwtSecret = process.env.JWT_SECRET_KEY;

  if (!jwtSecret) {
    return response.status(500).json({
      success: false,
      message: 'JWT secret is not configured on the server.',
    });
  }

  try {
    const decodedPayload = jwt.verify(token, jwtSecret);
    request.authenticatedUser = decodedPayload;
    return next();
  } catch (tokenError) {
    return response.status(401).json({
      success: false,
      message: 'Invalid or expired authorization token.',
    });
  }
}

module.exports = {
  authenticateRequestToken,
};
