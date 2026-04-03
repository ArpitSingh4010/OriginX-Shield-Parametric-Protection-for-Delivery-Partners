/**
 * Express router for delivery partner registration and profile management.
 *
 * Endpoints:
 *   POST  /api/delivery-partners/register       - Register a new delivery partner
 *   GET   /api/delivery-partners/               - List all delivery partners (paginated)
 *   GET   /api/delivery-partners/:partnerId     - Fetch a partner's full profile
 *   PATCH /api/delivery-partners/:partnerId/verify - Mark a partner as verified
 *   PATCH /api/delivery-partners/:partnerId     - Update partner details
 */

'use strict';

const express = require('express');
const DeliveryPartner = require('../models/DeliveryPartner');
const { validateIncomingRequest } = require('../middleware/validationMiddleware');
const { assessCityRiskWithAi } = require('../services/aiIntegrationService');
const {
  deliveryPartnerRegistrationValidators,
  deliveryPartnerIdParamValidators,
} = require('../validators/requestValidators');

const deliveryPartnerRouter = express.Router();
const ALLOWED_LOCATION_RISK_CATEGORIES = new Set([
  'low_risk_zone',
  'moderate_risk_zone',
  'high_risk_zone',
  'very_high_risk_zone',
]);

// ─── POST /api/delivery-partners/register ────────────────────────────────────

/**
 * Registers a new delivery partner account.
 *
 * Required body fields:
 *   fullName, emailAddress, mobilePhoneNumber, primaryDeliveryCity,
 *   primaryDeliveryZoneCoordinates { latitude, longitude },
 *   deliveryPlatformNames (array)
 *
 * Optional:
 *   averageMonthlyEarningsInRupees, locationRiskCategory
 */
deliveryPartnerRouter.post(
  '/register',
  deliveryPartnerRegistrationValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const {
      fullName,
      emailAddress,
      mobilePhoneNumber,
      primaryDeliveryCity,
      primaryDeliveryZoneCoordinates,
      deliveryPlatformNames,
      averageMonthlyEarningsInRupees,
      locationRiskCategory,
    } = request.body;

    const existingPartnerWithSameEmail = await DeliveryPartner.findOne({
      emailAddress,
    });
    if (existingPartnerWithSameEmail) {
      return response.status(409).json({
        success: false,
        message: 'A delivery partner account with this email address already exists.',
      });
    }

    const existingPartnerWithSamePhone = await DeliveryPartner.findOne({
      mobilePhoneNumber,
    });
    if (existingPartnerWithSamePhone) {
      return response.status(409).json({
        success: false,
        message: 'A delivery partner account with this phone number already exists.',
      });
    }

    let resolvedRiskAssessment;
    if (locationRiskCategory !== undefined && locationRiskCategory !== null) {
      const requestedRiskCategory = String(locationRiskCategory).toLowerCase();
      if (!ALLOWED_LOCATION_RISK_CATEGORIES.has(requestedRiskCategory)) {
        return response.status(400).json({
          success: false,
          message: 'Invalid locationRiskCategory. Must be one of: low_risk_zone, moderate_risk_zone, high_risk_zone, very_high_risk_zone.',
        });
      }
      resolvedRiskAssessment = {
        source: 'request_override',
        assignedRiskCategory: requestedRiskCategory,
        computedRiskScore: null,
      };
    } else {
      resolvedRiskAssessment = await assessCityRiskWithAi(primaryDeliveryCity);
    }

    const newDeliveryPartner = new DeliveryPartner({
      fullName,
      emailAddress,
      mobilePhoneNumber,
      primaryDeliveryCity,
      primaryDeliveryZoneCoordinates,
      deliveryPlatformNames,
      averageMonthlyEarningsInRupees: averageMonthlyEarningsInRupees || null,
      locationRiskCategory: resolvedRiskAssessment.assignedRiskCategory,
    });

    const savedDeliveryPartner = await newDeliveryPartner.save();

    return response.status(201).json({
      success: true,
      message: 'Delivery partner registered successfully.',
      deliveryPartner: {
        partnerId: savedDeliveryPartner._id,
        fullName: savedDeliveryPartner.fullName,
        emailAddress: savedDeliveryPartner.emailAddress,
        primaryDeliveryCity: savedDeliveryPartner.primaryDeliveryCity,
        deliveryPlatformNames: savedDeliveryPartner.deliveryPlatformNames,
        locationRiskCategory: savedDeliveryPartner.locationRiskCategory,
        locationRiskAssessmentSource: resolvedRiskAssessment.source,
        locationRiskScore: resolvedRiskAssessment.computedRiskScore,
        accountRegistrationDate: savedDeliveryPartner.accountRegistrationDate,
      },
    });
  } catch (registrationError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to register delivery partner.',
      errorDetails: registrationError.message,
    });
  }
  }
);

// ─── GET /api/delivery-partners/ ─────────────────────────────────────────────

/**
 * Returns a paginated list of all registered delivery partners.
 * Supports optional filtering by city (?city=Chennai) and platform (?platform=swiggy).
 */
deliveryPartnerRouter.get('/', async (request, response) => {
  try {
    const { city, platform, verified, page = 1, limit = 20 } = request.query;

    const filterQuery = {};
    if (city) {
      filterQuery.primaryDeliveryCity = { $regex: new RegExp(city, 'i') };
    }
    if (platform) {
      filterQuery.deliveryPlatformNames = platform.toLowerCase();
    }
    if (verified !== undefined) {
      filterQuery.isAccountVerified = verified === 'true';
    }

    const pageNumber = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skipCount = (pageNumber - 1) * pageSize;

    const [deliveryPartners, totalCount] = await Promise.all([
      DeliveryPartner.find(filterQuery)
        .sort({ accountRegistrationDate: -1 })
        .skip(skipCount)
        .limit(pageSize)
        .select('-__v'),
      DeliveryPartner.countDocuments(filterQuery),
    ]);

    return response.status(200).json({
      success: true,
      totalCount,
      page: pageNumber,
      limit: pageSize,
      deliveryPartners,
    });
  } catch (listFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve delivery partners.',
      errorDetails: listFetchError.message,
    });
  }
});

// ─── GET /api/delivery-partners/:partnerId ────────────────────────────────────

/**
 * Retrieves the full profile of a registered delivery partner by their ID.
 * Populates the active insurance policy reference.
 */
deliveryPartnerRouter.get(
  '/:partnerId',
  deliveryPartnerIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { partnerId } = request.params;

    const deliveryPartner = await DeliveryPartner.findById(partnerId)
      .populate(
        'activeInsurancePolicyId',
        'selectedPlanTier weeklyPremiumChargedInRupees maximumWeeklyCoverageInRupees remainingCoverageInRupees currentPolicyStatus policyStartDate policyEndDate'
      )
      .select('-__v');

    if (!deliveryPartner) {
      return response.status(404).json({
        success: false,
        message: `No delivery partner found with ID: ${partnerId}`,
      });
    }

    return response.status(200).json({
      success: true,
      deliveryPartner,
    });
  } catch (profileFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve delivery partner profile.',
      errorDetails: profileFetchError.message,
    });
  }
  }
);

// ─── PATCH /api/delivery-partners/:partnerId/verify ──────────────────────────

/**
 * Marks a delivery partner's account as verified.
 * In a production system this would follow KYC document validation.
 */
deliveryPartnerRouter.patch(
  '/:partnerId/verify',
  deliveryPartnerIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { partnerId } = request.params;

    const deliveryPartner = await DeliveryPartner.findByIdAndUpdate(
      partnerId,
      { isAccountVerified: true },
      { new: true, runValidators: true }
    ).select('-__v');

    if (!deliveryPartner) {
      return response.status(404).json({
        success: false,
        message: `No delivery partner found with ID: ${partnerId}`,
      });
    }

    return response.status(200).json({
      success: true,
      message: 'Delivery partner account verified successfully.',
      deliveryPartner: {
        partnerId: deliveryPartner._id,
        fullName: deliveryPartner.fullName,
        isAccountVerified: deliveryPartner.isAccountVerified,
      },
    });
  } catch (verifyError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to verify delivery partner account.',
      errorDetails: verifyError.message,
    });
  }
  }
);

// ─── PATCH /api/delivery-partners/:partnerId ──────────────────────────────────

/**
 * Updates editable fields on a delivery partner profile.
 * Allowed fields: primaryDeliveryCity, primaryDeliveryZoneCoordinates,
 *   deliveryPlatformNames, averageMonthlyEarningsInRupees, locationRiskCategory.
 */
deliveryPartnerRouter.patch(
  '/:partnerId',
  deliveryPartnerIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { partnerId } = request.params;

    const ALLOWED_UPDATE_FIELDS = [
      'primaryDeliveryCity',
      'primaryDeliveryZoneCoordinates',
      'deliveryPlatformNames',
      'averageMonthlyEarningsInRupees',
      'locationRiskCategory',
    ];

    const updatePayload = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (request.body[field] !== undefined) {
        updatePayload[field] = request.body[field];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return response.status(400).json({
        success: false,
        message: 'No valid fields provided for update.',
        allowedFields: ALLOWED_UPDATE_FIELDS,
      });
    }

    const updatedDeliveryPartner = await DeliveryPartner.findByIdAndUpdate(
      partnerId,
      updatePayload,
      { new: true, runValidators: true }
    ).select('-__v');

    if (!updatedDeliveryPartner) {
      return response.status(404).json({
        success: false,
        message: `No delivery partner found with ID: ${partnerId}`,
      });
    }

    return response.status(200).json({
      success: true,
      message: 'Delivery partner profile updated successfully.',
      deliveryPartner: updatedDeliveryPartner,
    });
  } catch (updateError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to update delivery partner profile.',
      errorDetails: updateError.message,
    });
  }
  }
);

module.exports = deliveryPartnerRouter;
