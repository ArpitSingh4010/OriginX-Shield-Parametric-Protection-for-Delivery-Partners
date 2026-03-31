const { validationResult } = require('express-validator');

function validateIncomingRequest(request, response, next) {
  const validationErrors = validationResult(request);

  if (!validationErrors.isEmpty()) {
    return response.status(400).json({
      success: false,
      message: 'Request validation failed.',
      errors: validationErrors.array(),
    });
  }

  return next();
}

module.exports = {
  validateIncomingRequest,
};
