const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { validateIncomingRequest } = require('../middleware/validationMiddleware');

const authRouter = express.Router();

const authTokenRequestValidators = [
  body('username').trim().notEmpty().withMessage('username is required.'),
  body('password').notEmpty().withMessage('password is required.'),
];

authRouter.post(
  '/token',
  authTokenRequestValidators,
  validateIncomingRequest,
  async (request, response) => {
    const { username, password } = request.body;
    const configuredUsername = process.env.AUTH_DEMO_USERNAME || 'admin';
    const configuredPasswordHash = process.env.AUTH_DEMO_PASSWORD_HASH || '';
    const jwtSecret = process.env.JWT_SECRET_KEY;

    if (!jwtSecret) {
      return response.status(500).json({
        success: false,
        message: 'JWT secret is not configured on the server.',
      });
    }

    if (username !== configuredUsername) {
      return response.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    if (!configuredPasswordHash) {
      return response.status(500).json({
        success: false,
        message: 'AUTH_DEMO_PASSWORD_HASH is not configured on the server.',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, configuredPasswordHash);

    if (!isPasswordValid) {
      return response.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    const accessToken = jwt.sign(
      {
        sub: configuredUsername,
        role: 'admin',
      },
      jwtSecret,
      {
        expiresIn: '8h',
      }
    );

    return response.status(200).json({
      success: true,
      accessToken,
      tokenType: 'Bearer',
      expiresIn: '8h',
    });
  }
);

module.exports = authRouter;
