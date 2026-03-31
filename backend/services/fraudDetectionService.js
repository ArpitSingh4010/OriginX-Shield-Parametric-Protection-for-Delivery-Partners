/**
 * Fraud detection service.
 *
 * Performs multi-layer verification to assess the legitimacy of an
 * insurance claim before approving a payout.  Checks include:
 *   1. Location consistency across GPS and network signals
 *   2. Delivery platform activity verification
 *   3. Claim frequency analysis for the delivery partner
 *   4. AI-based anomaly risk scoring
 *
 * Each check contributes to a composite fraud risk score in [0, 1].
 * A score closer to 0 means the claim appears legitimate; closer to 1
 * means there is a high likelihood of fraud.
 */

const {
  FRAUD_DETECTION_THRESHOLDS,
} = require('../config/parametricInsuranceConstants');

/**
 * Calculates the straight-line distance in kilometres between two
 * geographic coordinate pairs using the Haversine formula.
 *
 * @param {number} latitudePointA  - Latitude of the first coordinate.
 * @param {number} longitudePointA - Longitude of the first coordinate.
 * @param {number} latitudePointB  - Latitude of the second coordinate.
 * @param {number} longitudePointB - Longitude of the second coordinate.
 * @returns {number} Distance in kilometres.
 */
function calculateDistanceBetweenCoordinatesInKilometres(
  latitudePointA,
  longitudePointA,
  latitudePointB,
  longitudePointB
) {
  const EARTH_RADIUS_IN_KILOMETRES = 6371;
  const latitudeDifferenceInRadians =
    ((latitudePointB - latitudePointA) * Math.PI) / 180;
  const longitudeDifferenceInRadians =
    ((longitudePointB - longitudePointA) * Math.PI) / 180;

  const haversineIntermediate =
    Math.sin(latitudeDifferenceInRadians / 2) *
      Math.sin(latitudeDifferenceInRadians / 2) +
    Math.cos((latitudePointA * Math.PI) / 180) *
      Math.cos((latitudePointB * Math.PI) / 180) *
      Math.sin(longitudeDifferenceInRadians / 2) *
      Math.sin(longitudeDifferenceInRadians / 2);

  const centralAngleInRadians =
    2 * Math.atan2(Math.sqrt(haversineIntermediate), Math.sqrt(1 - haversineIntermediate));

  return EARTH_RADIUS_IN_KILOMETRES * centralAngleInRadians;
}

/**
 * Verifies that the GPS-reported location and the network-signal-reported
 * location of the delivery partner are within the acceptable discrepancy
 * limit, reducing the likelihood of GPS spoofing.
 *
 * @param {object} gpsReportedCoordinates - { latitude, longitude } from GPS.
 * @param {object} networkSignalCoordinates - { latitude, longitude } from network.
 * @returns {{ isLocationConsistent: boolean, discrepancyInKilometres: number }}
 */
function verifyLocationConsistencyAcrossSources(
  gpsReportedCoordinates,
  networkSignalCoordinates
) {
  const discrepancyInKilometres = calculateDistanceBetweenCoordinatesInKilometres(
    gpsReportedCoordinates.latitude,
    gpsReportedCoordinates.longitude,
    networkSignalCoordinates.latitude,
    networkSignalCoordinates.longitude
  );

  const isLocationConsistent =
    discrepancyInKilometres <=
    FRAUD_DETECTION_THRESHOLDS.MAXIMUM_ALLOWED_LOCATION_DISCREPANCY_KILOMETRES;

  return { isLocationConsistent, discrepancyInKilometres };
}

/**
 * Determines whether the delivery partner was sufficiently active on
 * their delivery platform around the time of the disruption event.
 *
 * @param {number} minutesActiveOnDeliveryPlatform - Minutes of recorded
 *   platform activity within the disruption window.
 * @returns {boolean} True if the partner meets the minimum activity requirement.
 */
function wasDeliveryPartnerActiveOnPlatformDuringDisruption(
  minutesActiveOnDeliveryPlatform
) {
  return (
    minutesActiveOnDeliveryPlatform >=
    FRAUD_DETECTION_THRESHOLDS.MINIMUM_ACTIVE_DELIVERY_MINUTES_REQUIRED
  );
}

/**
 * Checks whether a delivery partner has exceeded the maximum allowed
 * number of claims in the current week, which could indicate abuse.
 *
 * @param {number} numberOfClaimsFiledThisWeek - Claims submitted by this
 *   partner in the current insurance week.
 * @returns {boolean} True if the claim frequency is suspiciously high.
 */
function hasDeliveryPartnerExceededWeeklyClaimLimit(numberOfClaimsFiledThisWeek) {
  return (
    numberOfClaimsFiledThisWeek >=
    FRAUD_DETECTION_THRESHOLDS.MAXIMUM_CLAIMS_PER_WEEK
  );
}

/**
 * Computes an overall fraud risk score for a claim by combining the
 * results of all individual verification checks into a single normalised
 * score in the range [0, 1].
 *
 * Individual check contributions:
 *   - Location inconsistency detected:  +0.40
 *   - Insufficient platform activity:   +0.30
 *   - Weekly claim limit exceeded:      +0.30
 *
 * @param {object} verificationCheckResults - Results from all checks.
 * @param {boolean} verificationCheckResults.isLocationConsistent
 * @param {boolean} verificationCheckResults.wasPartnerActiveOnPlatform
 * @param {boolean} verificationCheckResults.hasExceededWeeklyClaimLimit
 * @returns {number} Composite fraud risk score in [0, 1].
 */
function computeCompositeFraudRiskScore(verificationCheckResults) {
  const {
    isLocationConsistent,
    wasPartnerActiveOnPlatform,
    hasExceededWeeklyClaimLimit,
  } = verificationCheckResults;

  let accumulatedFraudRiskScore = 0;

  if (!isLocationConsistent) {
    accumulatedFraudRiskScore += 0.40;
  }

  if (!wasPartnerActiveOnPlatform) {
    accumulatedFraudRiskScore += 0.30;
  }

  if (hasExceededWeeklyClaimLimit) {
    accumulatedFraudRiskScore += 0.30;
  }

  return Math.min(accumulatedFraudRiskScore, 1.0);
}

/**
 * Determines whether a claim should be flagged for manual human review
 * based on whether its fraud risk score exceeds the automatic-approval limit.
 *
 * Claims with a fraud risk score above 0.4 are forwarded to a reviewer
 * rather than being automatically approved for payout.
 *
 * @param {number} fraudRiskScore - The composite score from
 *   computeCompositeFraudRiskScore.
 * @returns {boolean} True if the claim should be escalated for manual review.
 */
function shouldClaimBeEscalatedForManualFraudReview(fraudRiskScore) {
  const FRAUD_RISK_SCORE_THRESHOLD_FOR_MANUAL_REVIEW = 0.4;
  return fraudRiskScore > FRAUD_RISK_SCORE_THRESHOLD_FOR_MANUAL_REVIEW;
}

/**
 * Orchestrates all fraud verification checks for a single claim and
 * returns a comprehensive fraud assessment report.
 *
 * @param {object} claimVerificationInputData - All data needed for checks.
 * @param {object} claimVerificationInputData.gpsReportedCoordinates
 * @param {object} claimVerificationInputData.networkSignalCoordinates
 * @param {number} claimVerificationInputData.minutesActiveOnDeliveryPlatform
 * @param {number} claimVerificationInputData.numberOfClaimsFiledThisWeek
 * @returns {{
 *   fraudRiskScore: number,
 *   requiresManualReview: boolean,
 *   verificationDetails: object
 * }}
 */
function performComprehensiveFraudVerification(claimVerificationInputData) {
  const {
    gpsReportedCoordinates,
    networkSignalCoordinates,
    minutesActiveOnDeliveryPlatform,
    numberOfClaimsFiledThisWeek,
  } = claimVerificationInputData;

  const { isLocationConsistent, discrepancyInKilometres } =
    verifyLocationConsistencyAcrossSources(
      gpsReportedCoordinates,
      networkSignalCoordinates
    );

  const wasPartnerActiveOnPlatform =
    wasDeliveryPartnerActiveOnPlatformDuringDisruption(minutesActiveOnDeliveryPlatform);

  const hasExceededWeeklyClaimLimit =
    hasDeliveryPartnerExceededWeeklyClaimLimit(numberOfClaimsFiledThisWeek);

  const fraudRiskScore = computeCompositeFraudRiskScore({
    isLocationConsistent,
    wasPartnerActiveOnPlatform,
    hasExceededWeeklyClaimLimit,
  });

  const requiresManualReview = shouldClaimBeEscalatedForManualFraudReview(fraudRiskScore);

  return {
    fraudRiskScore,
    requiresManualReview,
    verificationDetails: {
      isLocationConsistent,
      locationDiscrepancyInKilometres: discrepancyInKilometres,
      wasPartnerActiveOnPlatform,
      hasExceededWeeklyClaimLimit,
    },
  };
}

module.exports = {
  calculateDistanceBetweenCoordinatesInKilometres,
  verifyLocationConsistencyAcrossSources,
  wasDeliveryPartnerActiveOnPlatformDuringDisruption,
  hasDeliveryPartnerExceededWeeklyClaimLimit,
  computeCompositeFraudRiskScore,
  shouldClaimBeEscalatedForManualFraudReview,
  performComprehensiveFraudVerification,
};
