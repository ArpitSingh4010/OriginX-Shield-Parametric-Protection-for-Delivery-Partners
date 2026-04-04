/**
 * Express router for disruption event management.
 *
 * Endpoints:
 *   POST /api/disruption-events/                    - Record a new disruption event
 *   GET  /api/disruption-events/                    - List all disruption events
 *   GET  /api/disruption-events/:eventId            - Get a specific disruption event
 *   POST /api/disruption-events/check-threshold     - Check if conditions exceed any threshold
 *   POST /api/disruption-events/:eventId/trigger-claims - Trigger claims for all active partners in zone
 */

'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { authenticateRequestToken, requireAdminRole } = require('../middleware/authMiddleware');

const DisruptionEvent = require('../models/DisruptionEvent');
const DeliveryPartner = require('../models/DeliveryPartner');
const InsurancePolicy = require('../models/InsurancePolicy');
const { processIncomingInsuranceClaim } = require('../services/claimProcessingService');
const {
  identifyTriggeredDisruptionEventTypes,
  calculateDisruptionSeverityRatio,
} = require('../services/disruptionThresholdChecker');
const {
  DISRUPTION_TRIGGER_THRESHOLDS,
  DISRUPTION_EVENT_TYPES,
  INSURANCE_POLICY_STATUSES,
} = require('../config/parametricInsuranceConstants');

const disruptionEventRouter = express.Router();

// ─── POST /api/disruption-events/ ────────────────────────────────────────────

/**
 * Records a new disruption event from an external monitoring source.
 *
 * The body should include the event type, affected city, zone coordinates,
 * radius, and the measured environmental values.
 */
disruptionEventRouter.post('/', authenticateRequestToken, requireAdminRole, async (request, response) => {
  try {
    const {
      disruptionType,
      customDisruptionTypeLabel,
      affectedCityName,
      affectedZoneCentreCoordinates,
      affectedRadiusInKilometres,
      measuredRainfallInMillimetres,
      measuredTemperatureInCelsius,
      measuredAirQualityIndex,
      measuredLpgShortageSeverityIndex,
      disruptionStartTimestamp,
      disruptionEndTimestamp,
      weatherApiDataSourceName,
      policyExclusionTag,
    } = request.body;

    if (
      disruptionType === DISRUPTION_EVENT_TYPES.OTHER &&
      !String(customDisruptionTypeLabel || '').trim()
    ) {
      return response.status(400).json({
        success: false,
        message: 'customDisruptionTypeLabel is required when disruptionType is other.',
      });
    }

    const newDisruptionEvent = new DisruptionEvent({
      disruptionType,
      customDisruptionTypeLabel:
        disruptionType === DISRUPTION_EVENT_TYPES.OTHER
          ? String(customDisruptionTypeLabel).trim()
          : null,
      affectedCityName,
      affectedZoneCentreCoordinates,
      affectedRadiusInKilometres,
      measuredRainfallInMillimetres: measuredRainfallInMillimetres || null,
      measuredTemperatureInCelsius: measuredTemperatureInCelsius || null,
      measuredAirQualityIndex: measuredAirQualityIndex || null,
      measuredLpgShortageSeverityIndex: measuredLpgShortageSeverityIndex || null,
      disruptionStartTimestamp: disruptionStartTimestamp || new Date(),
      disruptionEndTimestamp: disruptionEndTimestamp || null,
      weatherApiDataSourceName: weatherApiDataSourceName || 'manual_entry',
      policyExclusionTag: policyExclusionTag || null,
    });

    const savedDisruptionEvent = await newDisruptionEvent.save();

    return response.status(201).json({
      success: true,
      message: 'Disruption event recorded successfully.',
      disruptionEvent: savedDisruptionEvent,
    });
  } catch (disruptionEventCreationError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to record disruption event.',
      errorDetails: disruptionEventCreationError.message,
    });
  }
});

// ─── GET /api/disruption-events/ ─────────────────────────────────────────────

/**
 * Retrieves a paginated list of all disruption events, most recent first.
 * Supports optional filtering by city name via ?city=<cityName>.
 */
disruptionEventRouter.get('/', async (request, response) => {
  try {
    const { city, type, page = 1, limit = 20 } = request.query;

    const filterQuery = {};
    if (city) {
      filterQuery.affectedCityName = { $regex: new RegExp(city, 'i') };
    }
    if (type) {
      filterQuery.disruptionType = type;
    }

    const pageNumber = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skipCount = (pageNumber - 1) * pageSize;

    const [disruptionEvents, totalCount] = await Promise.all([
      DisruptionEvent.find(filterQuery)
        .sort({ disruptionStartTimestamp: -1 })
        .skip(skipCount)
        .limit(pageSize)
        .select('-__v'),
      DisruptionEvent.countDocuments(filterQuery),
    ]);

    return response.status(200).json({
      success: true,
      totalCount,
      page: pageNumber,
      limit: pageSize,
      disruptionEvents,
    });
  } catch (listFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve disruption events.',
      errorDetails: listFetchError.message,
    });
  }
});

// ─── GET /api/disruption-events/check-threshold ───────────────────────────────

/**
 * Utility endpoint — checks whether provided environmental conditions
 * exceed any parametric trigger threshold without creating a DB record.
 *
 * Useful for frontend dashboards to preview whether conditions qualify.
 */
disruptionEventRouter.post('/check-threshold', (request, response) => {
  try {
    const {
      rainfallInMillimetres,
      temperatureInCelsius,
      airQualityIndex,
      lpgShortageSeverityIndex,
    } = request.body;

    const currentEnvironmentalConditions = {
      rainfallInMillimetres,
      temperatureInCelsius,
      airQualityIndex,
      lpgShortageSeverityIndex,
    };

    const triggeredEventTypes = identifyTriggeredDisruptionEventTypes(
      currentEnvironmentalConditions
    );

    const thresholdBreachDetails = {
      rainfall: {
        measured: rainfallInMillimetres || 0,
        threshold: DISRUPTION_TRIGGER_THRESHOLDS.RAINFALL_MILLIMETRES,
        isBreached: (rainfallInMillimetres || 0) > DISRUPTION_TRIGGER_THRESHOLDS.RAINFALL_MILLIMETRES,
        severityRatio: calculateDisruptionSeverityRatio(
          rainfallInMillimetres || 0,
          DISRUPTION_TRIGGER_THRESHOLDS.RAINFALL_MILLIMETRES
        ),
      },
      temperature: {
        measured: temperatureInCelsius || 0,
        threshold: DISRUPTION_TRIGGER_THRESHOLDS.TEMPERATURE_CELSIUS,
        isBreached: (temperatureInCelsius || 0) > DISRUPTION_TRIGGER_THRESHOLDS.TEMPERATURE_CELSIUS,
        severityRatio: calculateDisruptionSeverityRatio(
          temperatureInCelsius || 0,
          DISRUPTION_TRIGGER_THRESHOLDS.TEMPERATURE_CELSIUS
        ),
      },
      airQuality: {
        measured: airQualityIndex || 0,
        threshold: DISRUPTION_TRIGGER_THRESHOLDS.AIR_QUALITY_INDEX,
        isBreached: (airQualityIndex || 0) > DISRUPTION_TRIGGER_THRESHOLDS.AIR_QUALITY_INDEX,
        severityRatio: calculateDisruptionSeverityRatio(
          airQualityIndex || 0,
          DISRUPTION_TRIGGER_THRESHOLDS.AIR_QUALITY_INDEX
        ),
      },
      lpgShortage: {
        measured: lpgShortageSeverityIndex || 0,
        threshold: DISRUPTION_TRIGGER_THRESHOLDS.LPG_SHORTAGE_SEVERITY_INDEX,
        isBreached:
          (lpgShortageSeverityIndex || 0)
          > DISRUPTION_TRIGGER_THRESHOLDS.LPG_SHORTAGE_SEVERITY_INDEX,
        severityRatio: calculateDisruptionSeverityRatio(
          lpgShortageSeverityIndex || 0,
          DISRUPTION_TRIGGER_THRESHOLDS.LPG_SHORTAGE_SEVERITY_INDEX
        ),
      },
    };

    return response.status(200).json({
      success: true,
      anyThresholdBreached: triggeredEventTypes.length > 0,
      triggeredEventTypes,
      thresholdBreachDetails,
    });
  } catch (thresholdCheckError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to check disruption thresholds.',
      errorDetails: thresholdCheckError.message,
    });
  }
});

// ─── GET /api/disruption-events/:eventId ─────────────────────────────────────

/**
 * Retrieves the full details of a specific disruption event.
 */
disruptionEventRouter.get('/:eventId', async (request, response) => {
  try {
    const { eventId } = request.params;

    const disruptionEvent = await DisruptionEvent.findById(eventId).select('-__v');

    if (!disruptionEvent) {
      return response.status(404).json({
        success: false,
        message: `No disruption event found with ID: ${eventId}`,
      });
    }

    return response.status(200).json({
      success: true,
      disruptionEvent,
    });
  } catch (eventFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve disruption event.',
      errorDetails: eventFetchError.message,
    });
  }
});

// ─── POST /api/disruption-events/:eventId/trigger-claims ─────────────────────

/**
 * Triggers automatic insurance claims for all delivery partners who:
 *   (a) are based in the affected city of the disruption event, AND
 *   (b) have an active insurance policy.
 *
 * This simulates the automated claim-trigger flow that would normally
 * run as a scheduled background job.
 *
 * The body must include:
 *   - networkSignalCoordinates  (fallback location signal)
 *   - minutesActiveOnDeliveryPlatform
 *   - currentEnvironmentalConditions (the sensor readings that triggered the event)
 */
disruptionEventRouter.post('/:eventId/trigger-claims', authenticateRequestToken, requireAdminRole, async (request, response) => {
  try {
    const { eventId } = request.params;

    if (!mongoose.isValidObjectId(eventId)) {
      return response.status(400).json({
        success: false,
        message: 'Invalid disruption event ID format.',
      });
    }

    const disruptionEvent = await DisruptionEvent.findById(eventId);
    if (!disruptionEvent) {
      return response.status(404).json({
        success: false,
        message: `Disruption event not found: ${eventId}`,
      });
    }

    if (disruptionEvent.hasAutomaticClaimTriggerBeenFired) {
      return response.status(409).json({
        success: false,
        message: 'Claims have already been triggered for this disruption event.',
        disruptionEventId: eventId,
      });
    }

    const {
      networkSignalCoordinates,
      minutesActiveOnDeliveryPlatform = 60,
      currentEnvironmentalConditions,
    } = request.body;

    // Find all partners in the affected city with an active policy.
    const eligibleDeliveryPartners = await DeliveryPartner.find({
      primaryDeliveryCity: { $regex: new RegExp(disruptionEvent.affectedCityName, 'i') },
      activeInsurancePolicyId: { $ne: null },
    });

    const claimResults = [];
    let successCount = 0;
    let failedCount = 0;

    for (const deliveryPartner of eligibleDeliveryPartners) {
      try {
        const claimResult = await processIncomingInsuranceClaim({
          deliveryPartnerId: deliveryPartner._id.toString(),
          triggeringDisruptionEventId: eventId,
          currentEnvironmentalConditions: currentEnvironmentalConditions || {
            rainfallInMillimetres: disruptionEvent.measuredRainfallInMillimetres || 0,
            temperatureInCelsius: disruptionEvent.measuredTemperatureInCelsius || 0,
            airQualityIndex: disruptionEvent.measuredAirQualityIndex || 0,
            lpgShortageSeverityIndex:
              disruptionEvent.measuredLpgShortageSeverityIndex || 0,
          },
          partnerLocationAtDisruptionTime:
            deliveryPartner.primaryDeliveryZoneCoordinates,
          networkSignalCoordinates: networkSignalCoordinates ||
            deliveryPartner.primaryDeliveryZoneCoordinates,
          minutesActiveOnDeliveryPlatform,
        });

        claimResults.push({
          partnerId: deliveryPartner._id,
          partnerName: deliveryPartner.fullName,
          claimId: claimResult.claim._id,
          status: claimResult.claim.currentClaimStatus,
          wasAutoApproved: claimResult.wasAutoApproved,
        });
        successCount += 1;
      } catch (individualClaimError) {
        claimResults.push({
          partnerId: deliveryPartner._id,
          partnerName: deliveryPartner.fullName,
          error: individualClaimError.message,
        });
        failedCount += 1;
      }
    }

    // Mark the disruption event so it cannot be triggered again.
    disruptionEvent.hasAutomaticClaimTriggerBeenFired = true;
    disruptionEvent.numberOfAffectedDeliveryPartners = successCount;
    await disruptionEvent.save();

    return response.status(200).json({
      success: true,
      message: `Claim processing complete. ${successCount} succeeded, ${failedCount} failed.`,
      disruptionEventId: eventId,
      totalEligiblePartners: eligibleDeliveryPartners.length,
      successCount,
      failedCount,
      claimResults,
    });
  } catch (triggerError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to trigger claims for disruption event.',
      errorDetails: triggerError.message,
    });
  }
});

module.exports = disruptionEventRouter;
