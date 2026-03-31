/**
 * Unit tests for the weekly premium calculator service.
 *
 * Verifies that premium calculations are correct for all plan tiers and
 * location risk categories, and that edge-case inputs are handled safely.
 */

const {
  calculateAdjustedWeeklyPremium,
  calculateProRatedPremiumForRemainingDays,
  getInsurancePlanConfiguration,
  getRiskMultiplierForLocationCategory,
} = require('../services/weeklyPremiumCalculator');

describe('getInsurancePlanConfiguration', () => {
  test('returns correct configuration for the basic plan tier', () => {
    const basicPlanConfiguration = getInsurancePlanConfiguration('basic');
    expect(basicPlanConfiguration.weeklyPremiumInRupees).toBe(25);
    expect(basicPlanConfiguration.maximumCoverageInRupees).toBe(300);
  });

  test('returns correct configuration for the standard plan tier', () => {
    const standardPlanConfiguration = getInsurancePlanConfiguration('standard');
    expect(standardPlanConfiguration.weeklyPremiumInRupees).toBe(40);
    expect(standardPlanConfiguration.maximumCoverageInRupees).toBe(500);
  });

  test('returns correct configuration for the premium plan tier', () => {
    const premiumPlanConfiguration = getInsurancePlanConfiguration('premium');
    expect(premiumPlanConfiguration.weeklyPremiumInRupees).toBe(60);
    expect(premiumPlanConfiguration.maximumCoverageInRupees).toBe(700);
  });

  test('is case-insensitive and accepts uppercase plan tier names', () => {
    const planConfiguration = getInsurancePlanConfiguration('BASIC');
    expect(planConfiguration.weeklyPremiumInRupees).toBe(25);
  });

  test('throws an error when an unrecognised plan tier is supplied', () => {
    expect(() => getInsurancePlanConfiguration('platinum')).toThrow(
      'Unknown insurance plan tier'
    );
  });
});

describe('getRiskMultiplierForLocationCategory', () => {
  test('returns 1.0 multiplier for low risk zone', () => {
    expect(getRiskMultiplierForLocationCategory('LOW_RISK_ZONE')).toBe(1.0);
  });

  test('returns 1.5 multiplier for high risk zone', () => {
    expect(getRiskMultiplierForLocationCategory('HIGH_RISK_ZONE')).toBe(1.5);
  });

  test('returns 1.8 multiplier for very high risk zone', () => {
    expect(getRiskMultiplierForLocationCategory('VERY_HIGH_RISK_ZONE')).toBe(1.8);
  });

  test('falls back to moderate risk multiplier for unknown category', () => {
    const fallbackMultiplier = getRiskMultiplierForLocationCategory('unknown_zone');
    expect(fallbackMultiplier).toBe(1.2);
  });
});

describe('calculateAdjustedWeeklyPremium', () => {
  test('calculates correct premium for basic plan in low risk zone', () => {
    const { adjustedWeeklyPremiumInRupees, maximumCoverageInRupees } =
      calculateAdjustedWeeklyPremium('basic', 'LOW_RISK_ZONE');

    expect(adjustedWeeklyPremiumInRupees).toBe(25);
    expect(maximumCoverageInRupees).toBe(300);
  });

  test('calculates correct premium for premium plan in high risk zone', () => {
    const { adjustedWeeklyPremiumInRupees, maximumCoverageInRupees } =
      calculateAdjustedWeeklyPremium('premium', 'HIGH_RISK_ZONE');

    expect(adjustedWeeklyPremiumInRupees).toBe(90);
    expect(maximumCoverageInRupees).toBe(700);
  });

  test('calculates correct premium for standard plan in very high risk zone', () => {
    const { adjustedWeeklyPremiumInRupees } = calculateAdjustedWeeklyPremium(
      'standard',
      'VERY_HIGH_RISK_ZONE'
    );

    expect(adjustedWeeklyPremiumInRupees).toBe(72);
  });

  test('returns a rounded integer rupee amount', () => {
    const { adjustedWeeklyPremiumInRupees } = calculateAdjustedWeeklyPremium(
      'basic',
      'MODERATE_RISK_ZONE'
    );
    expect(Number.isInteger(adjustedWeeklyPremiumInRupees)).toBe(true);
  });
});

describe('calculateProRatedPremiumForRemainingDays', () => {
  test('returns the full weekly premium when all 7 days remain', () => {
    const fullWeeklyPremium = 70;
    expect(calculateProRatedPremiumForRemainingDays(fullWeeklyPremium, 7)).toBe(70);
  });

  test('returns half the weekly premium for 3.5 days (rounded)', () => {
    const proRatedPremium = calculateProRatedPremiumForRemainingDays(70, 3);
    expect(proRatedPremium).toBe(30);
  });

  test('returns 0 when 0 days remain', () => {
    expect(calculateProRatedPremiumForRemainingDays(70, 0)).toBe(0);
  });
});
