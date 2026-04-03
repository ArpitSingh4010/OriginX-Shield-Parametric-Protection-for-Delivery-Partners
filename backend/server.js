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

const { connectToDatabase } = require('./config/databaseConfig');
const { startWeatherMonitoring, runWeatherMonitoringCycle } = require('./services/weatherMonitoringService');
const deliveryPartnerRouter = require('./routes/deliveryPartnerRoutes');
const insurancePolicyRouter = require('./routes/insurancePolicyRoutes');
const insuranceClaimRouter  = require('./routes/insuranceClaimRoutes');
const disruptionEventRouter = require('./routes/disruptionEventRoutes');
const authRouter = require('./routes/authRoutes');

const HTTP_SERVER_PORT = Number(process.env.PORT || '5000');
const FRONTEND_URL = process.env.FRONTEND_URL;

const expressApplication = express();

expressApplication.use(cors({ origin: FRONTEND_URL || true, credentials: true }));
expressApplication.use(express.json());

// â”€â”€â”€ API Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

expressApplication.use('/api/delivery-partners',  deliveryPartnerRouter);
expressApplication.use('/api/insurance-policies', insurancePolicyRouter);
expressApplication.use('/api/insurance-claims',   insuranceClaimRouter);
expressApplication.use('/api/disruption-events',  disruptionEventRouter);
expressApplication.use('/api/auth',               authRouter);

// â”€â”€â”€ Admin Utility Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Health Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

expressApplication.get('/', (request, response) => {
  response.status(200).json({
    status: 'ok',
    serviceName: 'GigShield Parametric Insurance API',
    message: 'Backend is running. Use /api/health for detailed health status.',
  });
});

expressApplication.get('/api/health', (request, response) => {
  response.status(200).json({
    status:          'healthy',
    serviceName:     'GigShield Parametric Insurance API',
    serverTimestamp: new Date().toISOString(),
    environment:     process.env.NODE_ENV || 'development',
    paymentMode:     require('./services/paymentService').IS_PAYMENT_STUB_MODE ? 'stub' : 'live',
    weatherMonitor:  process.env.WEATHER_API_KEY ? 'active' : 'disabled (no API key)',
  });
});

// â”€â”€â”€ 404 Catch-all â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

expressApplication.use((request, response) => {
  response.status(404).json({
    success: false,
    message: `Route not found: ${request.method} ${request.originalUrl}`,
  });
});

// â”€â”€â”€ Server Bootstrap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function startHttpServer() {
  await connectToDatabase();

  expressApplication.listen(HTTP_SERVER_PORT, () => {
    console.log(`âœ…  GigShield API server running on port ${HTTP_SERVER_PORT}`);
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


