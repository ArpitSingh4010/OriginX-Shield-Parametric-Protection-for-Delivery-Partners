/**
 * Unit tests for the weekly premium calculator service.
 *
 * Verifies that premium calculations are correct for all plan tiers and
 * location risk categories, and that edge-case inputs are handled safely.
 */

const {
  calculateAdjustedWeeklyPremium,
  calculateContextualWeeklyPremium,
  calculateProjectedLossRatio,
  calculateProRatedPremiumForRemainingDays,
  getInsurancePlanConfiguration,
  getPlatformRiskMultiplier,
  getRiskMultiplierForLocationCategory,
  identifyPersonaEarningsBand,
  resolveSeasonalRiskMultiplier,
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

describe('getPlatformRiskMultiplier', () => {
  test('returns average multiplier for multiple platforms', () => {
    const platformMultiplier = getPlatformRiskMultiplier(['swiggy', 'blinkit']);
    expect(platformMultiplier).toBeCloseTo(1.085, 3);
  });

  test('returns default OTHER multiplier for empty list', () => {
    expect(getPlatformRiskMultiplier([])).toBe(1.0);
  });
});

describe('identifyPersonaEarningsBand', () => {
  test('returns entry-level band for low monthly earnings', () => {
    const earningsBand = identifyPersonaEarningsBand(18000);
    expect(earningsBand.averageDailyEarningsInRupees).toBe(700);
  });

  test('maps boundary value to the next band as expected', () => {
    const earningsBand = identifyPersonaEarningsBand(22000);
    expect(earningsBand.averageDailyEarningsInRupees).toBe(1000);
  });

  test('falls back to mid-tier band for out-of-range value', () => {
    const earningsBand = identifyPersonaEarningsBand(100000);
    expect(earningsBand.averageDailyEarningsInRupees).toBe(1000);
  });
});

describe('calculateProjectedLossRatio', () => {
  test('returns expected ratio rounded to 2 decimals', () => {
    const projectedLossRatio = calculateProjectedLossRatio({
      weeklyPremiumInRupees: 100,
      weeklyCoverageInRupees: 300,
      expectedPayoutSeverityRatio: 0.3,
    });
    expect(projectedLossRatio).toBe(0.9);
  });
});

describe('calculateContextualWeeklyPremium', () => {
  test('returns premium and justification with sustainable loss-ratio signal', () => {
    const calculationResult = calculateContextualWeeklyPremium({
      selectedPlanTier: 'standard',
      locationRiskCategory: 'moderate_risk_zone',
      deliveryPlatformNames: ['swiggy'],
      averageMonthlyEarningsInRupees: 25000,
    });

    expect(calculationResult.adjustedWeeklyPremiumInRupees).toBeGreaterThan(0);
    expect(calculationResult.maximumCoverageInRupees).toBe(500);
    expect(calculationResult.pricingJustification.weeklyEarningsEstimateInRupees).toBe(6000);
    expect(calculationResult.pricingJustification.platformRiskMultiplier).toBe(1.05);
    expect(calculationResult.pricingJustification.seasonalRiskPeriod).toBeDefined();
    expect(calculationResult.pricingJustification.seasonalRiskMultiplier).toBeGreaterThan(0);
    expect([
      'above_sustainable_band',
      'within_sustainable_band',
      'below_sustainable_band',
    ]).toContain(calculationResult.pricingJustification.lossRatioAssessment);
  });
});

describe('resolveSeasonalRiskMultiplier', () => {
  test('returns monsoon multiplier for July', () => {
    const result = resolveSeasonalRiskMultiplier(new Date('2026-07-10T00:00:00.000Z'));
    expect(result.seasonalRiskPeriod).toBe('monsoon');
    expect(result.seasonalRiskMultiplier).toBe(1.15);
  });

  test('returns summer heat multiplier for April', () => {
    const result = resolveSeasonalRiskMultiplier(new Date('2026-04-10T00:00:00.000Z'));
    expect(result.seasonalRiskPeriod).toBe('summer_heat');
    expect(result.seasonalRiskMultiplier).toBe(1.1);
  });

  test('returns default multiplier for December', () => {
    const result = resolveSeasonalRiskMultiplier(new Date('2026-12-10T00:00:00.000Z'));
    expect(result.seasonalRiskPeriod).toBe('default');
    expect(result.seasonalRiskMultiplier).toBe(1);
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
