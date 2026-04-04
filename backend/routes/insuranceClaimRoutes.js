/**
 * Express router for insurance claim submission and management.
 *
 * Endpoints:
 *   POST  /api/insurance-claims/submit                  - Submit a new claim
 *   GET   /api/insurance-claims/partner/:partnerId      - List all claims for a partner
 *   GET   /api/insurance-claims/flagged                 - List all claims pending manual review
 *   GET   /api/insurance-claims/:claimId               - Fetch claim details and status
 *   PATCH /api/insurance-claims/:claimId/review         - Admin: approve or reject flagged claim
 */

'use strict';

const express = require('express');
const InsuranceClaim = require('../models/InsuranceClaim');
const { authenticateRequestToken, requireAdminRole } = require('../middleware/authMiddleware');
const { validateIncomingRequest } = require('../middleware/validationMiddleware');
const {
  submitClaimValidators,
  claimIdParamValidators,
  deliveryPartnerIdParamValidators,
} = require('../validators/requestValidators');
const {
  processIncomingInsuranceClaim,
  processManualClaimReviewDecision,
} = require('../services/claimProcessingService');
const { INSURANCE_CLAIM_STATUSES } = require('../config/parametricInsuranceConstants');

const insuranceClaimRouter = express.Router();

// ─── POST /api/insurance-claims/submit ───────────────────────────────────────

/**
 * Accepts a claim submission for a delivery partner affected by a
 * disruption event.  Runs fraud verification and either auto-approves
 * or escalates the claim for manual review.
 *
 * Required body:
 *   deliveryPartnerId, triggeringDisruptionEventId,
 *   currentEnvironmentalConditions { rainfallInMillimetres, temperatureInCelsius, airQualityIndex },
 *   partnerLocationAtDisruptionTime { latitude, longitude },
 *   networkSignalCoordinates { latitude, longitude },
 *   minutesActiveOnDeliveryPlatform
 *
 * Optional body:
 *   beneficiaryBankDetails { accountHolderName, accountNumber, ifscCode }
 */
insuranceClaimRouter.post(
  '/submit',
  submitClaimValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const {
      deliveryPartnerId,
      triggeringDisruptionEventId,
      currentEnvironmentalConditions,
      partnerLocationAtDisruptionTime,
      networkSignalCoordinates,
      minutesActiveOnDeliveryPlatform,
      beneficiaryBankDetails,
    } = request.body;

    const claimProcessingResult = await processIncomingInsuranceClaim({
      deliveryPartnerId,
      triggeringDisruptionEventId,
      currentEnvironmentalConditions,
      partnerLocationAtDisruptionTime,
      networkSignalCoordinates,
      minutesActiveOnDeliveryPlatform,
      beneficiaryBankDetails: beneficiaryBankDetails || {},
    });

    const httpStatusCode = claimProcessingResult.wasAutoApproved ? 201 : 202;
    const responseMessage = claimProcessingResult.wasAutoApproved
      ? 'Claim approved and payout initiated automatically.'
      : 'Claim submitted but flagged for manual fraud review.';

    return response.status(httpStatusCode).json({
      success: true,
      message: responseMessage,
      wasAutoApproved: claimProcessingResult.wasAutoApproved,
      claim: {
        claimId: claimProcessingResult.claim._id,
        currentClaimStatus: claimProcessingResult.claim.currentClaimStatus,
        requestedCompensationAmountInRupees:
          claimProcessingResult.claim.requestedCompensationAmountInRupees,
        approvedPayoutAmountInRupees:
          claimProcessingResult.claim.approvedPayoutAmountInRupees,
        razorpayPayoutTransactionId:
          claimProcessingResult.claim.razorpayPayoutTransactionId,
        payoutProcessedTimestamp:
          claimProcessingResult.claim.payoutProcessedTimestamp,
      },
    });
  } catch (claimSubmissionError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to process insurance claim.',
      errorDetails: claimSubmissionError.message,
    });
  }
  }
);

// ─── GET /api/insurance-claims/flagged ───────────────────────────────────────

/**
 * Returns all claims currently flagged for manual human review.
 * Intended for use by admin/operations dashboards.
 */
insuranceClaimRouter.get('/flagged', authenticateRequestToken, requireAdminRole, async (request, response) => {
  try {
    const { page = 1, limit = 20 } = request.query;

    const pageNumber = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skipCount = (pageNumber - 1) * pageSize;

    const [flaggedClaims, totalCount] = await Promise.all([
      InsuranceClaim.find({
        currentClaimStatus: INSURANCE_CLAIM_STATUSES.FLAGGED_FOR_MANUAL_REVIEW,
      })
        .populate('deliveryPartnerId', 'fullName emailAddress primaryDeliveryCity')
        .populate(
          'triggeringDisruptionEventId',
          'disruptionType affectedCityName disruptionStartTimestamp'
        )
        .sort({ claimSubmissionTimestamp: -1 })
        .skip(skipCount)
        .limit(pageSize)
        .select('-__v'),
      InsuranceClaim.countDocuments({
        currentClaimStatus: INSURANCE_CLAIM_STATUSES.FLAGGED_FOR_MANUAL_REVIEW,
      }),
    ]);

    return response.status(200).json({
      success: true,
      totalCount,
      page: pageNumber,
      limit: pageSize,
      flaggedClaims,
    });
  } catch (flaggedFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve flagged claims.',
      errorDetails: flaggedFetchError.message,
    });
  }
});

// ─── GET /api/insurance-claims/partner/:partnerId ─────────────────────────────

/**
 * Retrieves all claims filed by a specific delivery partner.
 */
insuranceClaimRouter.get(
  '/partner/:partnerId',
  deliveryPartnerIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { partnerId } = request.params;
    const { status, page = 1, limit = 20 } = request.query;

    const filterQuery = { deliveryPartnerId: partnerId };
    if (status) {
      filterQuery.currentClaimStatus = status;
    }

    const pageNumber = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skipCount = (pageNumber - 1) * pageSize;

    const [claims, totalCount] = await Promise.all([
      InsuranceClaim.find(filterQuery)
        .populate(
          'triggeringDisruptionEventId',
          'disruptionType affectedCityName disruptionStartTimestamp'
        )
        .sort({ claimSubmissionTimestamp: -1 })
        .skip(skipCount)
        .limit(pageSize)
        .select('-__v'),
      InsuranceClaim.countDocuments(filterQuery),
    ]);

    return response.status(200).json({
      success: true,
      totalCount,
      page: pageNumber,
      limit: pageSize,
      claims,
    });
  } catch (partnerClaimsFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve claims for partner.',
      errorDetails: partnerClaimsFetchError.message,
    });
  }
  }
);

// ─── GET /api/insurance-claims/:claimId ──────────────────────────────────────

/**
 * Retrieves full details and current status of a specific insurance claim.
 */
insuranceClaimRouter.get(
  '/:claimId',
  claimIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { claimId } = request.params;

    const insuranceClaim = await InsuranceClaim.findById(claimId)
      .populate('deliveryPartnerId', 'fullName emailAddress primaryDeliveryCity')
      .populate(
        'triggeringDisruptionEventId',
        'disruptionType affectedCityName disruptionStartTimestamp measuredRainfallInMillimetres measuredTemperatureInCelsius measuredAirQualityIndex'
      )
      .populate(
        'associatedPolicyId',
        'selectedPlanTier weeklyPremiumChargedInRupees maximumWeeklyCoverageInRupees remainingCoverageInRupees'
      )
      .select('-__v');

    if (!insuranceClaim) {
      return response.status(404).json({
        success: false,
        message: `No insurance claim found with ID: ${claimId}`,
      });
    }

    return response.status(200).json({
      success: true,
      insuranceClaim,
    });
  } catch (claimFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve insurance claim.',
      errorDetails: claimFetchError.message,
    });
  }
  }
);

// ─── PATCH /api/insurance-claims/:claimId/review ─────────────────────────────

/**
 * Admin endpoint to manually approve or reject a claim flagged for review.
 *
 * Required body:
 *   decision: 'approve' | 'reject'
 *
 * Optional body:
 *   reviewerNotes: string
 */
insuranceClaimRouter.patch(
  '/:claimId/review',
  authenticateRequestToken,
  requireAdminRole,
  claimIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { claimId } = request.params;
    const { decision, reviewerNotes } = request.body;

    if (!decision || !['approve', 'reject'].includes(decision)) {
      return response.status(400).json({
        success: false,
        message:
          'Invalid or missing "decision" field. Must be "approve" or "reject".',
      });
    }

    const reviewedClaim = await processManualClaimReviewDecision(
      claimId,
      decision,
      reviewerNotes || ''
    );

    const outcomeMessage =
      decision === 'approve'
        ? 'Claim approved by reviewer. Payout initiated.'
        : 'Claim rejected by reviewer.';

    return response.status(200).json({
      success: true,
      message: outcomeMessage,
      claim: {
        claimId: reviewedClaim._id,
        currentClaimStatus: reviewedClaim.currentClaimStatus,
        approvedPayoutAmountInRupees: reviewedClaim.approvedPayoutAmountInRupees,
        razorpayPayoutTransactionId: reviewedClaim.razorpayPayoutTransactionId,
        fraudReviewNotes: reviewedClaim.fraudReviewNotes,
      },
    });
  } catch (reviewError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to process claim review decision.',
      errorDetails: reviewError.message,
    });
  }
  }
);

module.exports = insuranceClaimRouter;
