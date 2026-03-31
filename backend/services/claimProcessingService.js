/**
 * Claim processing service.
 *
 * Orchestrates the end-to-end lifecycle of an insurance claim:
 *   1. Validates that the delivery partner has an active policy
 *   2. Runs multi-layer fraud verification checks
 *   3. Determines whether to approve or flag the claim
 *   4. Initiates the payout via the payment gateway
 *   5. Updates the policy's remaining coverage balance
 */

const InsuranceClaim = require('../models/InsuranceClaim');
const InsurancePolicy = require('../models/InsurancePolicy');
const DeliveryPartner = require('../models/DeliveryPartner');
const {
  INSURANCE_CLAIM_STATUSES,
  INSURANCE_POLICY_STATUSES,
} = require('../config/parametricInsuranceConstants');
const { performComprehensiveFraudVerification } = require('./fraudDetectionService');
const {
  calculateDisruptionSeverityRatio,
  determineCompensationAmountForDisruption,
} = require('./disruptionThresholdChecker');

/**
 * Retrieves and validates the active insurance policy for a delivery
 * partner.  Throws if no active policy is found.
 *
 * @param {string} deliveryPartnerId - The MongoDB ObjectId of the partner.
 * @returns {Promise<InsurancePolicy>} The active policy document.
 * @throws {Error} If no active policy exists for the given partner.
 */
async function fetchActiveInsurancePolicyForDeliveryPartner(deliveryPartnerId) {
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
 * Creates a new insurance claim document in the database, setting its
 * initial status to PENDING_VERIFICATION.
 *
 * @param {object} claimInitialisationData - Data required to create the claim.
 * @param {string} claimInitialisationData.deliveryPartnerId
 * @param {string} claimInitialisationData.associatedPolicyId
 * @param {string} claimInitialisationData.triggeringDisruptionEventId
 * @param {number} claimInitialisationData.requestedCompensationAmountInRupees
 * @param {object} claimInitialisationData.partnerLocationAtDisruptionTime
 * @param {boolean} claimInitialisationData.wasPartnerActiveOnDeliveryPlatform
 * @returns {Promise<InsuranceClaim>} The newly created claim document.
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
 * Approves a claim and deducts the payout amount from the policy's
 * remaining coverage balance.
 *
 * @param {InsuranceClaim} insuranceClaim - The claim document to approve.
 * @param {InsurancePolicy} activeInsurancePolicy - The associated policy.
 * @param {number} approvedPayoutAmountInRupees - The amount to disburse.
 * @returns {Promise<InsuranceClaim>} The updated claim document.
 */
async function approveClaimAndDeductFromPolicyCoverage(
  insuranceClaim,
  activeInsurancePolicy,
  approvedPayoutAmountInRupees
) {
  insuranceClaim.approvedPayoutAmountInRupees = approvedPayoutAmountInRupees;
  insuranceClaim.currentClaimStatus = INSURANCE_CLAIM_STATUSES.APPROVED_FOR_PAYOUT;
  await insuranceClaim.save();

  activeInsurancePolicy.remainingCoverageInRupees -= approvedPayoutAmountInRupees;
  activeInsurancePolicy.totalClaimsFiledThisWeek += 1;

  if (activeInsurancePolicy.remainingCoverageInRupees <= 0) {
    activeInsurancePolicy.currentPolicyStatus = INSURANCE_POLICY_STATUSES.SUSPENDED;
  }

  await activeInsurancePolicy.save();
  return insuranceClaim;
}

/**
 * Flags a claim for manual review when the fraud risk score exceeds
 * the automatic-approval threshold.
 *
 * @param {InsuranceClaim} insuranceClaim - The claim to escalate.
 * @param {number} fraudRiskScore - The computed fraud risk score.
 * @param {object} verificationDetails - Details from fraud verification.
 * @returns {Promise<InsuranceClaim>} The updated claim document.
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

/**
 * Processes a new insurance claim from end to end:
 *   - Validates the active policy
 *   - Computes the compensation amount
 *   - Runs fraud verification
 *   - Approves or escalates the claim accordingly
 *
 * @param {object} incomingClaimRequestData - All data for the claim request.
 * @param {string} incomingClaimRequestData.deliveryPartnerId
 * @param {string} incomingClaimRequestData.triggeringDisruptionEventId
 * @param {object} incomingClaimRequestData.currentEnvironmentalConditions
 * @param {object} incomingClaimRequestData.partnerLocationAtDisruptionTime
 * @param {object} incomingClaimRequestData.networkSignalCoordinates
 * @param {number} incomingClaimRequestData.minutesActiveOnDeliveryPlatform
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
  } = incomingClaimRequestData;

  const activeInsurancePolicy =
    await fetchActiveInsurancePolicyForDeliveryPartner(deliveryPartnerId);

  const rainfallSeverityRatio = calculateDisruptionSeverityRatio(
    currentEnvironmentalConditions.rainfallInMillimetres || 0,
    50
  );
  const requestedCompensationAmountInRupees = determineCompensationAmountForDisruption(
    rainfallSeverityRatio,
    activeInsurancePolicy.remainingCoverageInRupees
  );

  const pendingClaim = await createPendingInsuranceClaim({
    deliveryPartnerId,
    associatedPolicyId: activeInsurancePolicy._id,
    triggeringDisruptionEventId,
    requestedCompensationAmountInRupees,
    partnerLocationAtDisruptionTime,
    wasPartnerActiveOnDeliveryPlatform: minutesActiveOnDeliveryPlatform >= 30,
  });

  const fraudAssessmentResult = performComprehensiveFraudVerification({
    gpsReportedCoordinates: partnerLocationAtDisruptionTime,
    networkSignalCoordinates,
    minutesActiveOnDeliveryPlatform,
    numberOfClaimsFiledThisWeek: activeInsurancePolicy.totalClaimsFiledThisWeek,
  });

  if (fraudAssessmentResult.requiresManualReview) {
    const escalatedClaim = await escalateClaimForManualFraudReview(
      pendingClaim,
      fraudAssessmentResult.fraudRiskScore,
      fraudAssessmentResult.verificationDetails
    );
    return { claim: escalatedClaim, wasAutoApproved: false };
  }

  const approvedClaim = await approveClaimAndDeductFromPolicyCoverage(
    pendingClaim,
    activeInsurancePolicy,
    requestedCompensationAmountInRupees
  );

  return { claim: approvedClaim, wasAutoApproved: true };
}

module.exports = {
  fetchActiveInsurancePolicyForDeliveryPartner,
  createPendingInsuranceClaim,
  approveClaimAndDeductFromPolicyCoverage,
  escalateClaimForManualFraudReview,
  processIncomingInsuranceClaim,
};
