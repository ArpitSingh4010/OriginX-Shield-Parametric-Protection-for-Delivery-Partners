/**
 * Claim processing service.
 *
 * Orchestrates the end-to-end lifecycle of an insurance claim:
 *   1. Validates that the delivery partner has an active policy
 *   2. Checks for coverage exclusions
 *   3. Calculates the compensation amount from the disruption severity
 *   4. Runs multi-layer fraud verification checks
 *   5. Approves or flags the claim for manual review
 *   6. Initiates the Razorpay payout for approved claims
 *   7. Updates the policy's remaining coverage balance
 */

'use strict';

const InsuranceClaim = require('../models/InsuranceClaim');
const InsurancePolicy = require('../models/InsurancePolicy');
const DeliveryPartner = require('../models/DeliveryPartner');
const DisruptionEvent = require('../models/DisruptionEvent');
const mongoose = require('mongoose');
const {
  INSURANCE_CLAIM_STATUSES,
  INSURANCE_POLICY_STATUSES,
  DISRUPTION_EVENT_TYPES,
  DISRUPTION_TRIGGER_THRESHOLDS,
  RISK_CONTROL_LIMITS,
} = require('../config/parametricInsuranceConstants');
const { performComprehensiveFraudVerification } = require('./fraudDetectionService');
const {
  calculateDisruptionSeverityRatio,
  determineCompensationAmountForDisruption,
} = require('./disruptionThresholdChecker');
const { initiateClaimPayout } = require('./paymentService');

const EXCLUSION_TAG_LABELS = {
  war_or_hostilities: 'war or hostile operations',
  pandemic_or_epidemic: 'pandemic or epidemic events',
};
// Conservative fallback window for anomaly checks when event timestamps are incomplete.
// Keeps AI behavior deterministic instead of deriving near-zero durations from missing values.
const DEFAULT_DISRUPTION_DURATION_IN_MINUTES = 120;

function resolveSeverityInputsForDisruptionEvent(disruptionType, currentEnvironmentalConditions) {
  const values = {
    measuredValue: 0,
    thresholdValue: 50,
  };

  if (disruptionType === DISRUPTION_EVENT_TYPES.HEAVY_RAINFALL) {
    values.measuredValue = Number(currentEnvironmentalConditions.rainfallInMillimetres) || 0;
    values.thresholdValue = DISRUPTION_TRIGGER_THRESHOLDS.RAINFALL_MILLIMETRES;
    return values;
  }

  if (disruptionType === DISRUPTION_EVENT_TYPES.EXTREME_HEAT) {
    values.measuredValue = Number(currentEnvironmentalConditions.temperatureInCelsius) || 0;
    values.thresholdValue = DISRUPTION_TRIGGER_THRESHOLDS.TEMPERATURE_CELSIUS;
    return values;
  }

  if (disruptionType === DISRUPTION_EVENT_TYPES.HAZARDOUS_AIR_QUALITY) {
    values.measuredValue = Number(currentEnvironmentalConditions.airQualityIndex) || 0;
    values.thresholdValue = DISRUPTION_TRIGGER_THRESHOLDS.AIR_QUALITY_INDEX;
    return values;
  }

  if (disruptionType === DISRUPTION_EVENT_TYPES.LPG_SHORTAGE) {
    values.measuredValue = Number(currentEnvironmentalConditions.lpgShortageSeverityIndex) || 0;
    values.thresholdValue = DISRUPTION_TRIGGER_THRESHOLDS.LPG_SHORTAGE_SEVERITY_INDEX;
    return values;
  }

  // Curfew/flooding are currently operational/mock triggers, so default full severity.
  values.measuredValue = 1;
  values.thresholdValue = 1;
  return values;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertValidMongoObjectId(idValue, fieldLabel) {
  if (!mongoose.isValidObjectId(idValue)) {
    throw new Error(`Invalid ${fieldLabel} format provided.`);
  }
}

// ─── Internal Steps ───────────────────────────────────────────────────────────

/**
 * Retrieves and validates the active insurance policy for a delivery partner.
 * Throws if no active policy is found.
 *
 * @param {string} deliveryPartnerId - The MongoDB ObjectId of the partner.
 * @returns {Promise<InsurancePolicy>} The active policy document.
 */
async function fetchActiveInsurancePolicyForDeliveryPartner(deliveryPartnerId) {
  assertValidMongoObjectId(deliveryPartnerId, 'delivery partner ID');

  const deliveryPartner = await DeliveryPartner.findById(deliveryPartnerId);
  if (!deliveryPartner || !deliveryPartner.activeInsurancePolicyId) {
    throw new Error(
      `No active insurance policy found for delivery partner ID: ${deliveryPartnerId}`
    );
  }

  const activeInsurancePolicy = await InsurancePolicy.findById(
    deliveryPartner.activeInsurancePolicyId
  );

  if (!activeInsurancePolicy || !activeInsurancePolicy.isPolicyCurrentlyActive()) {
    throw new Error(
      `Insurance policy is not currently active for delivery partner ID: ${deliveryPartnerId}`
    );
  }

  return activeInsurancePolicy;
}

/**
 * Creates a new insurance claim document in PENDING_VERIFICATION state.
 *
 * @param {object} claimInitialisationData
 * @returns {Promise<InsuranceClaim>}
 */
async function createPendingInsuranceClaim(claimInitialisationData) {
  const newInsuranceClaim = new InsuranceClaim({
    ...claimInitialisationData,
    currentClaimStatus: INSURANCE_CLAIM_STATUSES.PENDING_VERIFICATION,
    claimSubmissionTimestamp: new Date(),
  });

  await newInsuranceClaim.save();
  return newInsuranceClaim;
}

/**
 * Approves a claim, initiates the Razorpay payout, and deducts the
 * payout amount from the policy's remaining coverage balance.
 *
 * @param {InsuranceClaim}   insuranceClaim         - The claim to approve.
 * @param {InsurancePolicy}  activeInsurancePolicy  - The associated policy.
 * @param {number}           approvedPayoutAmountInRupees
 * @param {object}           [beneficiaryBankDetails] - Bank details for payout.
 * @returns {Promise<InsuranceClaim>}
 */
async function approveClaimAndDeductFromPolicyCoverage(
  insuranceClaim,
  activeInsurancePolicy,
  approvedPayoutAmountInRupees,
  beneficiaryBankDetails = {}
) {
  insuranceClaim.approvedPayoutAmountInRupees = approvedPayoutAmountInRupees;
  insuranceClaim.currentClaimStatus = INSURANCE_CLAIM_STATUSES.APPROVED_FOR_PAYOUT;
  await insuranceClaim.save();

  // Initiate Razorpay payout (stub mode when keys not set).
  try {
    const payoutResult = await initiateClaimPayout(
      approvedPayoutAmountInRupees,
      insuranceClaim._id.toString(),
      beneficiaryBankDetails
    );

    insuranceClaim.currentClaimStatus = INSURANCE_CLAIM_STATUSES.PAYOUT_PROCESSED;
    insuranceClaim.razorpayPayoutTransactionId = payoutResult.payoutId;
    insuranceClaim.payoutProcessedTimestamp = new Date();
    await insuranceClaim.save();

    // Update delivery partner's total compensation.
    await DeliveryPartner.findByIdAndUpdate(insuranceClaim.deliveryPartnerId, {
      $inc: { totalCompensationReceivedInRupees: approvedPayoutAmountInRupees },
    });
  } catch (payoutError) {
    // Payout failed — keep claim as APPROVED_FOR_PAYOUT so it can be retried.
    console.error(
      `[ClaimProcessing] Payout failed for claim ${insuranceClaim._id}: ${payoutError.message}`
    );
  }

  // Deduct from policy coverage.
  activeInsurancePolicy.remainingCoverageInRupees -= approvedPayoutAmountInRupees;
  activeInsurancePolicy.totalClaimsFiledThisWeek += 1;

  if (activeInsurancePolicy.remainingCoverageInRupees <= 0) {
    activeInsurancePolicy.currentPolicyStatus = INSURANCE_POLICY_STATUSES.SUSPENDED;
  }

  await activeInsurancePolicy.save();

  const disruptionEvent = await DisruptionEvent.findById(insuranceClaim.triggeringDisruptionEventId);
  if (disruptionEvent) {
    disruptionEvent.totalCompensationDispersedInRupees =
      Number(disruptionEvent.totalCompensationDispersedInRupees || 0)
      + approvedPayoutAmountInRupees;
    await disruptionEvent.save();
  }

  return insuranceClaim;
}

/**
 * Flags a claim for manual review when the fraud risk score exceeds
 * the automatic-approval threshold.
 *
 * @param {InsuranceClaim} insuranceClaim     - The claim to escalate.
 * @param {number}         fraudRiskScore     - The computed fraud risk score.
 * @param {object}         verificationDetails - Details from fraud verification.
 * @returns {Promise<InsuranceClaim>}
 */
async function escalateClaimForManualFraudReview(
  insuranceClaim,
  fraudRiskScore,
  verificationDetails
) {
  insuranceClaim.currentClaimStatus = INSURANCE_CLAIM_STATUSES.FLAGGED_FOR_MANUAL_REVIEW;
  insuranceClaim.fraudRiskScoreAtTimeOfClaim = fraudRiskScore;
  insuranceClaim.fraudReviewNotes = JSON.stringify(verificationDetails);
  await insuranceClaim.save();
  return insuranceClaim;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Processes a new insurance claim from end to end.
 *
 * @param {object} incomingClaimRequestData
 * @param {string} incomingClaimRequestData.deliveryPartnerId
 * @param {string} incomingClaimRequestData.triggeringDisruptionEventId
 * @param {object} incomingClaimRequestData.currentEnvironmentalConditions
 * @param {object} incomingClaimRequestData.partnerLocationAtDisruptionTime
 * @param {object} incomingClaimRequestData.networkSignalCoordinates
 * @param {number} incomingClaimRequestData.minutesActiveOnDeliveryPlatform
 * @param {object} [incomingClaimRequestData.beneficiaryBankDetails]
 * @returns {Promise<{ claim: InsuranceClaim, wasAutoApproved: boolean }>}
 */
async function processIncomingInsuranceClaim(incomingClaimRequestData) {
  const {
    deliveryPartnerId,
    triggeringDisruptionEventId,
    currentEnvironmentalConditions,
    partnerLocationAtDisruptionTime,
    networkSignalCoordinates,
    minutesActiveOnDeliveryPlatform,
    beneficiaryBankDetails = {},
  } = incomingClaimRequestData;

  // Step 1 — Validate active policy.
  const activeInsurancePolicy =
    await fetchActiveInsurancePolicyForDeliveryPartner(deliveryPartnerId);

  // Step 2 — Validate disruption event exists.
  assertValidMongoObjectId(triggeringDisruptionEventId, 'disruption event ID');
  const triggeringDisruptionEvent = await DisruptionEvent.findById(
    triggeringDisruptionEventId
  );
  if (!triggeringDisruptionEvent) {
    throw new Error(
      `No disruption event found with ID: ${triggeringDisruptionEventId}`
    );
  }

  // Step 3 — Check coverage exclusions.
  const policyExclusions = activeInsurancePolicy.coverageExclusions;
  if (
    triggeringDisruptionEvent.policyExclusionTag &&
    policyExclusions.includes(triggeringDisruptionEvent.policyExclusionTag)
  ) {
    const exclusionLabel =
      EXCLUSION_TAG_LABELS[triggeringDisruptionEvent.policyExclusionTag] ||
      'excluded events';
    throw new Error(
      `Claim cannot be processed — relates to ${exclusionLabel}, ` +
        'which is excluded under this policy.'
    );
  }

  // Step 4 — Calculate compensation amount.
  const { measuredValue, thresholdValue } = resolveSeverityInputsForDisruptionEvent(
    triggeringDisruptionEvent.disruptionType,
    currentEnvironmentalConditions || {}
  );
  const rainfallSeverityRatio = calculateDisruptionSeverityRatio(
    measuredValue,
    thresholdValue
  );
  const requestedCompensationAmountInRupees = determineCompensationAmountForDisruption(
    rainfallSeverityRatio,
    activeInsurancePolicy.remainingCoverageInRupees
  );

  if (requestedCompensationAmountInRupees <= 0) {
    throw new Error(
      'Claim cannot be processed — measured disruption severity does not qualify for payout.'
    );
  }

  // Step 4b — Circuit breaker checks (event-level and city daily-level caps).
  const eventPayoutToDate = Number(triggeringDisruptionEvent.totalCompensationDispersedInRupees || 0);
  if (
    eventPayoutToDate + requestedCompensationAmountInRupees
    > RISK_CONTROL_LIMITS.MAXIMUM_EVENT_TOTAL_PAYOUT_IN_RUPEES
  ) {
    throw new Error(
      'Claim cannot be processed — event payout cap reached. Please retry after manual admin review.'
    );
  }

  const eventStart = new Date(triggeringDisruptionEvent.disruptionStartTimestamp || new Date());
  const startOfDayUtc = new Date(Date.UTC(
    eventStart.getUTCFullYear(),
    eventStart.getUTCMonth(),
    eventStart.getUTCDate(),
    0, 0, 0, 0
  ));
  const endOfDayUtc = new Date(Date.UTC(
    eventStart.getUTCFullYear(),
    eventStart.getUTCMonth(),
    eventStart.getUTCDate(),
    23, 59, 59, 999
  ));

  const eventDayCityPayoutAggregate = await DisruptionEvent.aggregate([
    {
      $match: {
        affectedCityName: triggeringDisruptionEvent.affectedCityName,
        disruptionStartTimestamp: { $gte: startOfDayUtc, $lte: endOfDayUtc },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$totalCompensationDispersedInRupees' },
      },
    },
  ]);

  const cityPayoutToDate = Number(eventDayCityPayoutAggregate?.[0]?.total || 0);
  if (
    cityPayoutToDate + requestedCompensationAmountInRupees
    > RISK_CONTROL_LIMITS.MAXIMUM_CITY_DAILY_PAYOUT_IN_RUPEES
  ) {
    throw new Error(
      'Claim cannot be processed — city daily payout circuit breaker is active.'
    );
  }

  const disruptionStartTimestamp = triggeringDisruptionEvent.disruptionStartTimestamp
    ? new Date(triggeringDisruptionEvent.disruptionStartTimestamp)
    : null;
  const disruptionEndTimestamp = triggeringDisruptionEvent.disruptionEndTimestamp
    ? new Date(triggeringDisruptionEvent.disruptionEndTimestamp)
    : null;
  const hasBothTimestamps =
    disruptionStartTimestamp instanceof Date
    && !Number.isNaN(disruptionStartTimestamp.getTime())
    && disruptionEndTimestamp instanceof Date
    && !Number.isNaN(disruptionEndTimestamp.getTime());
  const resolvedDisruptionDurationInMinutes = hasBothTimestamps
    ? Math.max(
      1,
      Math.round((disruptionEndTimestamp.getTime() - disruptionStartTimestamp.getTime()) / 60000)
    )
    : DEFAULT_DISRUPTION_DURATION_IN_MINUTES;

  // Step 5 — Create claim record.
  const pendingClaim = await createPendingInsuranceClaim({
    deliveryPartnerId,
    associatedPolicyId: activeInsurancePolicy._id,
    triggeringDisruptionEventId,
    claimReasonCategory: triggeringDisruptionEvent.disruptionType,
    requestedCompensationAmountInRupees,
    partnerLocationAtDisruptionTime,
    wasPartnerActiveOnDeliveryPlatform: minutesActiveOnDeliveryPlatform >= 30,
  });

  // Step 6 — Fraud verification.
  const fraudAssessmentResult = await performComprehensiveFraudVerification({
    claimId: pendingClaim._id.toString(),
    deliveryPartnerId,
    gpsReportedCoordinates: partnerLocationAtDisruptionTime,
    networkSignalCoordinates,
    minutesActiveOnDeliveryPlatform,
    numberOfClaimsFiledThisWeek: activeInsurancePolicy.totalClaimsFiledThisWeek,
    disruptionEpicentreCoordinates: triggeringDisruptionEvent.affectedZoneCentreCoordinates,
    disruptionDurationInMinutes: resolvedDisruptionDurationInMinutes,
  });

  if (fraudAssessmentResult.requiresManualReview) {
    const escalatedClaim = await escalateClaimForManualFraudReview(
      pendingClaim,
      fraudAssessmentResult.fraudRiskScore,
      fraudAssessmentResult.verificationDetails
    );
    return { claim: escalatedClaim, wasAutoApproved: false };
  }

  // Step 7 — Approve and initiate payout.
  const approvedClaim = await approveClaimAndDeductFromPolicyCoverage(
    pendingClaim,
    activeInsurancePolicy,
    requestedCompensationAmountInRupees,
    beneficiaryBankDetails
  );

  return { claim: approvedClaim, wasAutoApproved: true };
}

/**
 * Manually approves or rejects a claim that was flagged for review.
 * Used by the admin review endpoint.
 *
 * @param {string} claimId         - MongoDB claim document ID.
 * @param {'approve'|'reject'} decision
 * @param {string} [reviewerNotes]
 * @returns {Promise<InsuranceClaim>}
 */
async function processManualClaimReviewDecision(claimId, decision, reviewerNotes = '') {
  assertValidMongoObjectId(claimId, 'claim ID');

  const insuranceClaim = await InsuranceClaim.findById(claimId);
  if (!insuranceClaim) {
    throw new Error(`No insurance claim found with ID: ${claimId}`);
  }

  if (
    insuranceClaim.currentClaimStatus !==
    INSURANCE_CLAIM_STATUSES.FLAGGED_FOR_MANUAL_REVIEW
  ) {
    throw new Error(
      `Claim ${claimId} is not currently flagged for manual review. ` +
        `Current status: ${insuranceClaim.currentClaimStatus}`
    );
  }

  if (decision === 'reject') {
    insuranceClaim.currentClaimStatus = INSURANCE_CLAIM_STATUSES.REJECTED;
    insuranceClaim.fraudReviewNotes =
      `REJECTED by reviewer. Notes: ${reviewerNotes}`;
    await insuranceClaim.save();
    return insuranceClaim;
  }

  if (decision === 'approve') {
    const activeInsurancePolicy = await InsurancePolicy.findById(
      insuranceClaim.associatedPolicyId
    );

    if (!activeInsurancePolicy) {
      throw new Error('Associated policy not found for manual approval.');
    }

    const approvedClaim = await approveClaimAndDeductFromPolicyCoverage(
      insuranceClaim,
      activeInsurancePolicy,
      insuranceClaim.requestedCompensationAmountInRupees
    );

    approvedClaim.fraudReviewNotes =
      `APPROVED by reviewer. Notes: ${reviewerNotes}`;
    await approvedClaim.save();
    return approvedClaim;
  }

  throw new Error(`Unknown review decision: "${decision}". Use 'approve' or 'reject'.`);
}

module.exports = {
  fetchActiveInsurancePolicyForDeliveryPartner,
  createPendingInsuranceClaim,
  approveClaimAndDeductFromPolicyCoverage,
  escalateClaimForManualFraudReview,
  processIncomingInsuranceClaim,
  processManualClaimReviewDecision,
};
