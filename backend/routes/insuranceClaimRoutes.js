/**
 * Express router for insurance claim submission and status retrieval.
 *
 * Endpoints:
 *   POST /api/insurance-claims/submit     - Submit a new claim
 *   GET  /api/insurance-claims/:claimId   - Fetch claim details and status
 */

const express = require('express');
const InsuranceClaim = require('../models/InsuranceClaim');
const { processIncomingInsuranceClaim } = require('../services/claimProcessingService');

const insuranceClaimRouter = express.Router();

/**
 * POST /api/insurance-claims/submit
 *
 * Accepts a claim submission for a delivery partner affected by a
 * disruption event.  Runs fraud verification and either auto-approves
 * or escalates the claim for manual review.
 */
insuranceClaimRouter.post('/submit', async (request, response) => {
  try {
    const {
      deliveryPartnerId,
      triggeringDisruptionEventId,
      currentEnvironmentalConditions,
      partnerLocationAtDisruptionTime,
      networkSignalCoordinates,
      minutesActiveOnDeliveryPlatform,
    } = request.body;

    const claimProcessingResult = await processIncomingInsuranceClaim({
      deliveryPartnerId,
      triggeringDisruptionEventId,
      currentEnvironmentalConditions,
      partnerLocationAtDisruptionTime,
      networkSignalCoordinates,
      minutesActiveOnDeliveryPlatform,
    });

    const httpStatusCode = claimProcessingResult.wasAutoApproved ? 201 : 202;
    const responseMessage = claimProcessingResult.wasAutoApproved
      ? 'Claim approved and payout initiated automatically.'
      : 'Claim submitted successfully but flagged for manual fraud review.';

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
      },
    });
  } catch (claimSubmissionError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to process insurance claim.',
      errorDetails: claimSubmissionError.message,
    });
  }
});

/**
 * GET /api/insurance-claims/:claimId
 *
 * Retrieves the full details and current status of an insurance claim.
 */
insuranceClaimRouter.get('/:claimId', async (request, response) => {
  try {
    const { claimId } = request.params;

    const insuranceClaim = await InsuranceClaim.findById(claimId)
      .populate('deliveryPartnerId', 'fullName emailAddress')
      .populate('triggeringDisruptionEventId', 'disruptionType affectedCityName disruptionStartTimestamp')
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
});

module.exports = insuranceClaimRouter;
