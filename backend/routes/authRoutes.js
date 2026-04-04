const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { validateIncomingRequest } = require('../middleware/validationMiddleware');
const { authenticateRequestToken, requireAdminRole } = require('../middleware/authMiddleware');
const AdminUser = require('../models/AdminUser');

const authRouter = express.Router();

const authTokenRequestValidators = [
  body('username').trim().notEmpty().withMessage('username is required.'),
  body('password').notEmpty().withMessage('password is required.'),
];

const adminLoginValidators = [
  body('emailAddress').isEmail().withMessage('emailAddress must be a valid email.'),
  body('password').notEmpty().withMessage('password is required.'),
];

const createAdminValidators = [
  body('fullName').trim().notEmpty().withMessage('fullName is required.'),
  body('emailAddress').isEmail().withMessage('emailAddress must be a valid email.'),
  body('password').isLength({ min: 6 }).withMessage('password must be at least 6 characters long.'),
];

const DEFAULT_ADMIN_EMAIL = (process.env.DEFAULT_ADMIN_EMAIL || 'arpitsinght25@gmail.com').toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'pass123';
const DEFAULT_ADMIN_FULL_NAME = process.env.DEFAULT_ADMIN_FULL_NAME || 'Arpit Singh';

async function ensureDefaultAdminUserExists() {
  const existingAdmin = await AdminUser.findOne({ emailAddress: DEFAULT_ADMIN_EMAIL });
  if (existingAdmin) {
    return existingAdmin;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  return AdminUser.create({
    fullName: DEFAULT_ADMIN_FULL_NAME,
    emailAddress: DEFAULT_ADMIN_EMAIL,
    passwordHash,
  });
}

function signAdminAccessToken(adminUser, jwtSecret) {
  return jwt.sign(
    {
      sub: adminUser._id.toString(),
      role: 'admin',
      emailAddress: adminUser.emailAddress,
    },
    jwtSecret,
    {
      expiresIn: '8h',
    }
  );
}

authRouter.post(
  '/admin/login',
  adminLoginValidators,
  validateIncomingRequest,
  async (request, response) => {
    const { emailAddress, password } = request.body;
    const jwtSecret = process.env.JWT_SECRET_KEY;

    if (!jwtSecret) {
      return response.status(500).json({
        success: false,
        message: 'JWT secret is not configured on the server.',
      });
    }

    await ensureDefaultAdminUserExists();

    const adminUser = await AdminUser.findOne({
      emailAddress: String(emailAddress).toLowerCase(),
      isActive: true,
    });

    if (!adminUser) {
      return response.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, adminUser.passwordHash);
    if (!isPasswordValid) {
      return response.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const accessToken = signAdminAccessToken(adminUser, jwtSecret);

    return response.status(200).json({
      success: true,
      accessToken,
      tokenType: 'Bearer',
      expiresIn: '8h',
      adminUser: {
        adminId: adminUser._id,
        fullName: adminUser.fullName,
        emailAddress: adminUser.emailAddress,
      },
    });
  }
);

authRouter.get(
  '/admins',
  authenticateRequestToken,
  requireAdminRole,
  async (request, response) => {
    await ensureDefaultAdminUserExists();

    const adminUsers = await AdminUser.find({ isActive: true })
      .sort({ createdAt: 1 })
      .select('fullName emailAddress createdAt');

    return response.status(200).json({
      success: true,
      adminUsers,
    });
  }
);

authRouter.post(
  '/admins',
  authenticateRequestToken,
  requireAdminRole,
  createAdminValidators,
  validateIncomingRequest,
  async (request, response) => {
    const { fullName, emailAddress, password } = request.body;
    const normalisedEmailAddress = String(emailAddress).toLowerCase();

    const existingAdmin = await AdminUser.findOne({ emailAddress: normalisedEmailAddress });
    if (existingAdmin) {
      return response.status(409).json({
        success: false,
        message: 'An admin with this email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const createdAdminUser = await AdminUser.create({
      fullName,
      emailAddress: normalisedEmailAddress,
      passwordHash,
      createdByAdminId: request.authenticatedUser.sub,
    });

    return response.status(201).json({
      success: true,
      message: 'Admin user created successfully.',
      adminUser: {
        adminId: createdAdminUser._id,
        fullName: createdAdminUser.fullName,
        emailAddress: createdAdminUser.emailAddress,
      },
    });
  }
);

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
