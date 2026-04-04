/**
 * Main Express application entry point for the GigShield backend.
 *
 * Initialises middleware, registers API route handlers, starts
 * weather monitoring, and begins listening for HTTP requests.
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const { connectToDatabase } = require('./config/databaseConfig');
const { startWeatherMonitoring, runWeatherMonitoringCycle } = require('./services/weatherMonitoringService');
const deliveryPartnerRouter = require('./routes/deliveryPartnerRoutes');
const insurancePolicyRouter = require('./routes/insurancePolicyRoutes');
const insuranceClaimRouter  = require('./routes/insuranceClaimRoutes');
const disruptionEventRouter = require('./routes/disruptionEventRoutes');
const authRouter = require('./routes/authRoutes');

const HTTP_SERVER_PORT = Number(process.env.PORT || '5000');
const FRONTEND_URL = process.env.FRONTEND_URL;
const FRONTEND_URLS = (FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const expressApplication = express();

const isAllowedVercelOrigin = (origin = '') => {
  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
};

expressApplication.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (FRONTEND_URLS.length === 0) {
      return callback(null, true);
    }

    if (FRONTEND_URLS.includes(origin) || isAllowedVercelOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
expressApplication.use(express.json());

// In serverless deployments the startup path may be skipped, so ensure DB connectivity on demand.
expressApplication.use(async (request, response, next) => {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  try {
    await connectToDatabase();
    return next();
  } catch (error) {
    return response.status(500).json({
      success: false,
      message: 'Database connection unavailable',
      errorDetails: error.message,
    });
  }
});

// ================================ API Routes ================================

expressApplication.use('/api/delivery-partners',  deliveryPartnerRouter);
expressApplication.use('/api/insurance-policies', insurancePolicyRouter);
expressApplication.use('/api/insurance-claims',   insuranceClaimRouter);
expressApplication.use('/api/disruption-events',  disruptionEventRouter);
expressApplication.use('/api/auth',               authRouter);

// ============================ Admin Utility Endpoints ============================

/**
 * POST /api/admin/trigger-weather-check
 * Manually triggers one weather monitoring cycle across all cities.
 * Useful for demos and testing without waiting 30 minutes.
 */
expressApplication.post('/api/admin/trigger-weather-check', async (req, res) => {
  try {
    const result = await runWeatherMonitoringCycle();
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, errorDetails: err.message });
  }
});

// =============================== Health Check ===============================

expressApplication.get('/', (request, response) => {
  response.status(200).json({
    status: 'ok',
    serviceName: 'RakshaRide Parametric Insurance API',
    message: 'Backend is running. Use /api/health for detailed health status.',
  });
});

expressApplication.get('/api/health', (request, response) => {
  const mongooseState = mongoose.connection.readyState;
  const databaseStatus = mongooseState === 1 ? 'connected' : 'disconnected';

  response.status(200).json({
    status:          'healthy',
    serviceName:     'RakshaRide Parametric Insurance API',
    databaseStatus,
    serverTimestamp: new Date().toISOString(),
    environment:     process.env.NODE_ENV || 'development',
    paymentMode:     require('./services/paymentService').IS_PAYMENT_STUB_MODE ? 'stub' : 'live',
    weatherMonitor:  process.env.WEATHER_API_KEY ? 'active' : 'disabled (no API key)',
  });
});

// =============================== 404 Catch-all ===============================

expressApplication.use((request, response) => {
  response.status(404).json({
    success: false,
    message: `Route not found: ${request.method} ${request.originalUrl}`,
  });
});

// ============================== Server Bootstrap ==============================

async function startHttpServer() {
  await connectToDatabase();

  expressApplication.listen(HTTP_SERVER_PORT, () => {
    console.log(`RakshaRide API server running on port ${HTTP_SERVER_PORT}`);
    console.log(`    Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`    Payment mode: ${require('./services/paymentService').IS_PAYMENT_STUB_MODE ? 'STUB' : 'LIVE'}`);
  });

  // Start weather polling after DB is connected.
  startWeatherMonitoring();
}

if (require.main === module) {
  startHttpServer().catch((err) => {
    console.error('Failed to start the HTTP server:', err.message);
    process.exit(1);
  });
}

module.exports = expressApplication;


