/**
 * Main Express application entry point for the RakshaRide backend.
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
const { authenticateRequestToken, requireAdminRole } = require('./middleware/authMiddleware');
const { registerPartnerAlertStream } = require('./services/alertStreamService');
const { processIncomingInsuranceClaim } = require('./services/claimProcessingService');
const DeliveryPartner = require('./models/DeliveryPartner');
const InsurancePolicy = require('./models/InsurancePolicy');
const InsuranceClaim = require('./models/InsuranceClaim');
const DisruptionEvent = require('./models/DisruptionEvent');
const { INSURANCE_CLAIM_STATUSES, INSURANCE_POLICY_STATUSES } = require('./config/parametricInsuranceConstants');
const deliveryPartnerRouter = require('./routes/deliveryPartnerRoutes');
const insurancePolicyRouter = require('./routes/insurancePolicyRoutes');
const insuranceClaimRouter  = require('./routes/insuranceClaimRoutes');
const disruptionEventRouter = require('./routes/disruptionEventRoutes');
const authRouter = require('./routes/authRoutes');
const customerSupportRouter = require('./routes/customerSupportRoutes');

const HTTP_SERVER_PORT = Number(process.env.PORT || '5000');
const FRONTEND_URL = process.env.FRONTEND_URL;
const FRONTEND_URLS = (FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_FRONTEND_HOST_SUFFIXES = ['.vercel.app', '.netlify.app', '.onrender.com'];

const expressApplication = express();

const isAllowedDeploymentOrigin = (origin = '') => {
  try {
    const hostname = new URL(origin).hostname;
    return ALLOWED_FRONTEND_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
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

    if (FRONTEND_URLS.includes(origin) || isAllowedDeploymentOrigin(origin)) {
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
expressApplication.use('/api/customer-support',   customerSupportRouter);

expressApplication.get('/api/alerts/stream', async (request, response) => {
  const partnerId = String(request.query.partnerId || '').trim();

  if (!partnerId || !mongoose.isValidObjectId(partnerId)) {
    return response.status(400).json({
      success: false,
      message: 'Valid partnerId query parameter is required for alert stream.',
    });
  }

  registerPartnerAlertStream(partnerId, response);
  return undefined;
});

// ============================ Admin Utility Endpoints ============================

/**
 * POST /api/admin/trigger-weather-check
 * Manually triggers one weather monitoring cycle across all cities.
 * Useful for demos and testing without waiting 30 minutes.
 */
expressApplication.post('/api/admin/trigger-weather-check', authenticateRequestToken, requireAdminRole, async (req, res) => {
  try {
    const result = await runWeatherMonitoringCycle();
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, errorDetails: err.message });
  }
});

expressApplication.get('/api/admin/stats', authenticateRequestToken, requireAdminRole, async (request, response) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalPartners,
      verifiedPartners,
      activePolicies,
      totalClaims,
      claimsThisWeek,
      totalEvents,
      claimCountsByStatus,
      payoutAggregate,
      flaggedClaimsCount,
      weeklyPayoutTrend,
      partnerEarningsAggregate,
      claimsPerDay,
      cityWisePartnerDensity,
      cityWiseEventsThisWeek,
    ] = await Promise.all([
      DeliveryPartner.countDocuments({}),
      DeliveryPartner.countDocuments({ isAccountVerified: true }),
      InsurancePolicy.countDocuments({
        currentPolicyStatus: INSURANCE_POLICY_STATUSES.ACTIVE,
        policyEndDate: { $gte: now },
      }),
      InsuranceClaim.countDocuments({}),
      InsuranceClaim.countDocuments({
        claimSubmissionTimestamp: { $gte: startOfWeek },
      }),
      DisruptionEvent.countDocuments({}),
      InsuranceClaim.aggregate([
        { $group: { _id: '$currentClaimStatus', count: { $sum: 1 } } },
      ]),
      InsuranceClaim.aggregate([
        { $match: { currentClaimStatus: INSURANCE_CLAIM_STATUSES.PAYOUT_PROCESSED } },
        { $group: { _id: null, totalPayout: { $sum: '$approvedPayoutAmountInRupees' } } },
      ]),
      InsuranceClaim.countDocuments({ currentClaimStatus: INSURANCE_CLAIM_STATUSES.FLAGGED_FOR_MANUAL_REVIEW }),
      InsuranceClaim.aggregate([
        { $match: { currentClaimStatus: INSURANCE_CLAIM_STATUSES.PAYOUT_PROCESSED } },
        {
          $group: {
            _id: {
              year: { $isoWeekYear: '$claimSubmissionTimestamp' },
              week: { $isoWeek: '$claimSubmissionTimestamp' },
            },
            totalPayout: { $sum: '$approvedPayoutAmountInRupees' },
            claims: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': -1, '_id.week': -1 } },
        { $limit: 8 },
        { $sort: { '_id.year': 1, '_id.week': 1 } },
      ]),
      DeliveryPartner.aggregate([
        {
          $group: {
            _id: null,
            totalMonthlyEarnings: { $sum: { $ifNull: ['$averageMonthlyEarningsInRupees', 0] } },
          },
        },
      ]),
      InsuranceClaim.aggregate([
        { $match: { claimSubmissionTimestamp: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: {
              dateKey: {
                $dateToString: { format: '%Y-%m-%d', date: '$claimSubmissionTimestamp' },
              },
              dateLabel: {
                $dateToString: { format: '%d %b', date: '$claimSubmissionTimestamp' },
              },
            },
            totalClaims: { $sum: 1 },
          },
        },
        { $sort: { '_id.dateKey': 1 } },
      ]),
      DeliveryPartner.aggregate([
        {
          $group: {
            _id: '$primaryDeliveryCity',
            totalPartners: { $sum: 1 },
            verifiedPartners: {
              $sum: {
                $cond: [{ $eq: ['$isAccountVerified', true] }, 1, 0],
              },
            },
          },
        },
        { $sort: { totalPartners: -1 } },
        { $limit: 12 },
      ]),
      DisruptionEvent.aggregate([
        { $match: { disruptionStartTimestamp: { $gte: startOfWeek } } },
        {
          $group: {
            _id: '$affectedCityName',
            eventsThisWeek: { $sum: 1 },
          },
        },
      ]),
    ]);

    const countsByStatus = claimCountsByStatus.reduce((accumulator, claimStatusGroup) => {
      accumulator[claimStatusGroup._id] = claimStatusGroup.count;
      return accumulator;
    }, {});

    const totalPayout = Number(payoutAggregate?.[0]?.totalPayout || 0);
    const monthlyEarnings = Number(partnerEarningsAggregate?.[0]?.totalMonthlyEarnings || 0);
    const cityEventMap = new Map(
      cityWiseEventsThisWeek.map((entry) => [entry._id, Number(entry.eventsThisWeek || 0)])
    );

    const cityRiskHeatmap = cityWisePartnerDensity.map((cityEntry) => {
      const cityName = cityEntry._id || 'Unknown';
      const eventsInWeek = cityEventMap.get(cityName) || 0;
      const partnersInCity = Number(cityEntry.totalPartners || 0);
      const disruptionIntensity = partnersInCity > 0
        ? Number((eventsInWeek / partnersInCity).toFixed(2))
        : 0;

      let riskBand = 'low';
      if (disruptionIntensity >= 0.4) {
        riskBand = 'high';
      } else if (disruptionIntensity >= 0.2) {
        riskBand = 'moderate';
      }

      return {
        cityName,
        totalPartners: partnersInCity,
        verifiedPartners: Number(cityEntry.verifiedPartners || 0),
        eventsThisWeek: eventsInWeek,
        disruptionIntensity,
        riskBand,
      };
    });

    return response.status(200).json({
      success: true,
      stats: {
        totalPartners,
        verifiedPartners,
        activePolicies,
        totalClaims,
        claimsThisWeek,
        totalEvents,
        totalPayouts: totalPayout,
        flaggedClaims: flaggedClaimsCount,
        totalPayout,
        flaggedClaimsCount,
        fraudRate: totalClaims > 0 ? Number((flaggedClaimsCount / totalClaims).toFixed(4)) : 0,
        claimsByStatus: countsByStatus,
        claimsPerDay: claimsPerDay.map((entry) => ({
          label: entry._id.dateLabel,
          totalClaims: Number(entry.totalClaims || 0),
        })),
        cityRiskHeatmap,
        earningsVsPayout: {
          estimatedWeeklyPartnerEarnings: Math.round(monthlyEarnings / 4),
          totalPayoutIssued: totalPayout,
        },
        weeklyPayoutTrend: weeklyPayoutTrend.map((entry) => ({
          label: `W${entry._id.week}/${String(entry._id.year).slice(-2)}`,
          payout: Number(entry.totalPayout || 0),
          claims: Number(entry.claims || 0),
        })),
      },
    });
  } catch (error) {
    return response.status(500).json({
      success: false,
      message: 'Failed to load admin statistics.',
      errorDetails: error.message,
    });
  }
});

expressApplication.post('/api/admin/seed-demo', authenticateRequestToken, requireAdminRole, async (request, response) => {
  try {
    const city = String(request.body?.city || 'Jaipur').trim();
    const coordinates = request.body?.coordinates || { latitude: 26.9124, longitude: 75.7873 };

    const demoEmail = `demo.${city.toLowerCase().replace(/[^a-z0-9]+/g, '')}@raksharide.local`;
    let deliveryPartner = await DeliveryPartner.findOne({ emailAddress: demoEmail });

    if (!deliveryPartner) {
      deliveryPartner = await DeliveryPartner.create({
        fullName: `Demo Partner ${city}`,
        emailAddress: demoEmail,
        passwordHash: 'demo_password_hash',
        mobilePhoneNumber: `9${Date.now().toString().slice(-9)}`,
        primaryDeliveryCity: city,
        primaryDeliveryZoneCoordinates: coordinates,
        deliveryPlatformNames: ['swiggy'],
        isEmailVerified: true,
        isAccountVerified: true,
        averageMonthlyEarningsInRupees: 28000,
      });
    }

    let activePolicy = deliveryPartner.activeInsurancePolicyId
      ? await InsurancePolicy.findById(deliveryPartner.activeInsurancePolicyId)
      : null;

    if (!activePolicy || !activePolicy.isPolicyCurrentlyActive()) {
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 7);

      activePolicy = await InsurancePolicy.create({
        deliveryPartnerId: deliveryPartner._id,
        selectedPlanTier: 'standard',
        weeklyPremiumChargedInRupees: 40,
        maximumWeeklyCoverageInRupees: 500,
        remainingCoverageInRupees: 500,
        policyStartDate: now,
        policyEndDate: endDate,
        currentPolicyStatus: INSURANCE_POLICY_STATUSES.ACTIVE,
      });

      deliveryPartner.activeInsurancePolicyId = activePolicy._id;
      await deliveryPartner.save();
    }

    const disruptionEvent = await DisruptionEvent.create({
      disruptionType: 'heavy_rainfall',
      affectedCityName: city,
      affectedZoneCentreCoordinates: coordinates,
      affectedRadiusInKilometres: 12,
      measuredRainfallInMillimetres: 92,
      measuredTemperatureInCelsius: 32,
      measuredAirQualityIndex: 140,
      disruptionStartTimestamp: new Date(),
      weatherApiDataSourceName: 'demo-seeder',
    });

    const claimProcessingResult = await processIncomingInsuranceClaim({
      deliveryPartnerId: deliveryPartner._id.toString(),
      triggeringDisruptionEventId: disruptionEvent._id.toString(),
      currentEnvironmentalConditions: {
        rainfallInMillimetres: 92,
        temperatureInCelsius: 32,
        airQualityIndex: 140,
      },
      partnerLocationAtDisruptionTime: coordinates,
      networkSignalCoordinates: coordinates,
      minutesActiveOnDeliveryPlatform: 110,
      beneficiaryBankDetails: {
        accountHolderName: deliveryPartner.fullName,
        accountNumber: '1234567890',
        ifscCode: 'SBIN0000456',
      },
    });

    return response.status(200).json({
      success: true,
      message: 'Demo data seeded successfully.',
      demo: {
        partnerId: deliveryPartner._id,
        partnerEmail: deliveryPartner.emailAddress,
        policyId: activePolicy._id,
        disruptionEventId: disruptionEvent._id,
        claimId: claimProcessingResult.claim._id,
        claimStatus: claimProcessingResult.claim.currentClaimStatus,
        wasAutoApproved: claimProcessingResult.wasAutoApproved,
      },
    });
  } catch (error) {
    return response.status(500).json({
      success: false,
      message: 'Failed to seed demo data.',
      errorDetails: error.message,
    });
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


