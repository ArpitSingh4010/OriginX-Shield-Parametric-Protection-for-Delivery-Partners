/**
 * Unit tests for the fraud detection service.
 *
 * Verifies that location consistency checks, activity checks, claim
 * frequency checks, and composite risk scoring all behave correctly.
 */

const {
  calculateDistanceBetweenCoordinatesInKilometres,
  verifyLocationConsistencyAcrossSources,
  wasDeliveryPartnerActiveOnPlatformDuringDisruption,
  hasDeliveryPartnerExceededWeeklyClaimLimit,
  computeCompositeFraudRiskScore,
  shouldClaimBeEscalatedForManualFraudReview,
  performComprehensiveFraudVerification,
} = require('../services/fraudDetectionService');

describe('calculateDistanceBetweenCoordinatesInKilometres', () => {
  test('returns 0 for identical coordinates', () => {
    const distance = calculateDistanceBetweenCoordinatesInKilometres(
      13.0827, 80.2707, 13.0827, 80.2707
    );
    expect(distance).toBeCloseTo(0, 2);
  });

  test('calculates approximate distance between Chennai and Bengaluru', () => {
    const distanceBetweenCities = calculateDistanceBetweenCoordinatesInKilometres(
      13.0827, 80.2707,
      12.9716, 77.5946
    );
    expect(distanceBetweenCities).toBeGreaterThan(280);
    expect(distanceBetweenCities).toBeLessThan(320);
  });
});

describe('verifyLocationConsistencyAcrossSources', () => {
  test('flags location as consistent when GPS and network signals are close', () => {
    const { isLocationConsistent } = verifyLocationConsistencyAcrossSources(
      { latitude: 13.0827, longitude: 80.2707 },
      { latitude: 13.0830, longitude: 80.2710 }
    );
    expect(isLocationConsistent).toBe(true);
  });

  test('flags location as inconsistent when GPS and network signals are far apart', () => {
    const { isLocationConsistent, discrepancyInKilometres } =
      verifyLocationConsistencyAcrossSources(
        { latitude: 13.0827, longitude: 80.2707 },
        { latitude: 12.9716, longitude: 77.5946 }
      );
    expect(isLocationConsistent).toBe(false);
    expect(discrepancyInKilometres).toBeGreaterThan(2);
  });
});

describe('wasDeliveryPartnerActiveOnPlatformDuringDisruption', () => {
  test('returns true when active minutes meet or exceed the required minimum', () => {
    expect(wasDeliveryPartnerActiveOnPlatformDuringDisruption(30)).toBe(true);
    expect(wasDeliveryPartnerActiveOnPlatformDuringDisruption(60)).toBe(true);
  });

  test('returns false when active minutes are below the required minimum', () => {
    expect(wasDeliveryPartnerActiveOnPlatformDuringDisruption(10)).toBe(false);
  });
});

describe('hasDeliveryPartnerExceededWeeklyClaimLimit', () => {
  test('returns true when claim count meets or exceeds the weekly limit', () => {
    expect(hasDeliveryPartnerExceededWeeklyClaimLimit(3)).toBe(true);
    expect(hasDeliveryPartnerExceededWeeklyClaimLimit(5)).toBe(true);
  });

  test('returns false when claim count is below the weekly limit', () => {
    expect(hasDeliveryPartnerExceededWeeklyClaimLimit(2)).toBe(false);
  });
});

describe('computeCompositeFraudRiskScore', () => {
  test('returns 0 when all verification checks pass', () => {
    const fraudRiskScore = computeCompositeFraudRiskScore({
      isLocationConsistent: true,
      wasPartnerActiveOnPlatform: true,
      hasExceededWeeklyClaimLimit: false,
    });
    expect(fraudRiskScore).toBe(0);
  });

  test('returns 0.40 when only the location check fails', () => {
    const fraudRiskScore = computeCompositeFraudRiskScore({
      isLocationConsistent: false,
      wasPartnerActiveOnPlatform: true,
      hasExceededWeeklyClaimLimit: false,
    });
    expect(fraudRiskScore).toBeCloseTo(0.40);
  });

  test('returns 1.0 when all verification checks fail', () => {
    const fraudRiskScore = computeCompositeFraudRiskScore({
      isLocationConsistent: false,
      wasPartnerActiveOnPlatform: false,
      hasExceededWeeklyClaimLimit: true,
    });
    expect(fraudRiskScore).toBe(1.0);
  });
});

describe('shouldClaimBeEscalatedForManualFraudReview', () => {
  test('returns false for a low fraud risk score', () => {
    expect(shouldClaimBeEscalatedForManualFraudReview(0.2)).toBe(false);
  });

  test('returns true for a fraud risk score above 0.4', () => {
    expect(shouldClaimBeEscalatedForManualFraudReview(0.5)).toBe(true);
  });

  test('returns false for a fraud risk score of exactly 0.4', () => {
    expect(shouldClaimBeEscalatedForManualFraudReview(0.4)).toBe(false);
  });
});

describe('performComprehensiveFraudVerification', () => {
  test('approves a legitimate claim automatically without flagging for review', () => {
    const fraudAssessmentResult = performComprehensiveFraudVerification({
      gpsReportedCoordinates: { latitude: 13.0827, longitude: 80.2707 },
      networkSignalCoordinates: { latitude: 13.0828, longitude: 80.2708 },
      minutesActiveOnDeliveryPlatform: 45,
      numberOfClaimsFiledThisWeek: 1,
    });

    expect(fraudAssessmentResult.fraudRiskScore).toBe(0);
    expect(fraudAssessmentResult.requiresManualReview).toBe(false);
    expect(fraudAssessmentResult.verificationDetails.isLocationConsistent).toBe(true);
    expect(fraudAssessmentResult.verificationDetails.wasPartnerActiveOnPlatform).toBe(true);
  });

  test('flags a suspicious claim for manual review when location is inconsistent and partner was inactive', () => {
    const fraudAssessmentResult = performComprehensiveFraudVerification({
      gpsReportedCoordinates: { latitude: 13.0827, longitude: 80.2707 },
      networkSignalCoordinates: { latitude: 12.9716, longitude: 77.5946 },
      minutesActiveOnDeliveryPlatform: 5,
      numberOfClaimsFiledThisWeek: 1,
    });

    expect(fraudAssessmentResult.requiresManualReview).toBe(true);
    expect(fraudAssessmentResult.verificationDetails.isLocationConsistent).toBe(false);
    expect(fraudAssessmentResult.verificationDetails.wasPartnerActiveOnPlatform).toBe(false);
  });
});
