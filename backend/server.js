/**
 * Main Express application entry point for the GigShield backend.
 *
 * Initialises middleware, registers API route handlers, and starts
 * listening for incoming HTTP requests on the configured port.
 */

const express = require('express');
const cors = require('cors');

const { connectToDatabase } = require('./config/databaseConfig');
const deliveryPartnerRouter = require('./routes/deliveryPartnerRoutes');
const insurancePolicyRouter = require('./routes/insurancePolicyRoutes');
const insuranceClaimRouter = require('./routes/insuranceClaimRoutes');

const HTTP_SERVER_PORT = process.env.PORT || 5000;

const expressApplication = express();

expressApplication.use(cors());
expressApplication.use(express.json());

expressApplication.use('/api/delivery-partners', deliveryPartnerRouter);
expressApplication.use('/api/insurance-policies', insurancePolicyRouter);
expressApplication.use('/api/insurance-claims', insuranceClaimRouter);

/**
 * Health check endpoint used by monitoring tools and load balancers
 * to verify that the server is running and accepting connections.
 */
expressApplication.get('/api/health', (request, response) => {
  response.status(200).json({
    status: 'healthy',
    serviceName: 'GigShield Parametric Insurance API',
    serverTimestamp: new Date().toISOString(),
  });
});

/**
 * Starts the HTTP server after establishing a database connection.
 *
 * @returns {Promise<void>}
 */
async function startHttpServer() {
  await connectToDatabase();

  expressApplication.listen(HTTP_SERVER_PORT, () => {
    console.log(
      `GigShield API server is running on port ${HTTP_SERVER_PORT}`
    );
  });
}

startHttpServer().catch((serverStartupError) => {
  console.error('Failed to start the HTTP server:', serverStartupError.message);
  process.exit(1);
});

module.exports = expressApplication;
