/**
 * Weekly premium calculation service.
 *
 * Calculates the adjusted weekly premium for a delivery partner's chosen
 * insurance plan by applying a location-based risk multiplier to the
 * base plan premium.  The result is used at the time of policy enrollment
 * to determine how much the worker will be charged.
 */

const {
  WEEKLY_INSURANCE_PLANS,
  LOCATION_RISK_PREMIUM_MULTIPLIERS,
  PLATFORM_RISK_PREMIUM_MULTIPLIERS,
  DELIVERY_PARTNER_PERSONA_EARNINGS_BANDS,
  PREMIUM_MODEL_ASSUMPTIONS,
  LOSS_RATIO_GUARDRAILS,
  SEASONAL_RISK_PREMIUM_MULTIPLIERS,
} = require('../config/parametricInsuranceConstants');

/**
 * Retrieves the base plan configuration object for the given plan tier.
 *
 * @param {string} selectedPlanTier - The plan tier chosen by the worker
 *   ('basic', 'standard', or 'premium').
 * @returns {object} The plan configuration including base premium and coverage.
 * @throws {Error} If the plan tier is not one of the recognised options.
 */
function getInsurancePlanConfiguration(selectedPlanTier) {
  const normalisedPlanTier = selectedPlanTier.toUpperCase();
  const planConfiguration = WEEKLY_INSURANCE_PLANS[normalisedPlanTier];

  if (!planConfiguration) {
    throw new Error(
      `Unknown insurance plan tier: "${selectedPlanTier}". ` +
        `Valid options are: basic, standard, premium.`
    );
  }

  return planConfiguration;
}

/**
 * Retrieves the risk multiplier for the delivery partner's operating zone.
 *
 * @param {string} locationRiskCategory - The risk category assigned to the
 *   worker's primary delivery zone.
 * @returns {number} The multiplier to apply to the base premium (>= 1.0).
 */
function getRiskMultiplierForLocationCategory(locationRiskCategory) {
  const normalisedRiskCategory = locationRiskCategory.toUpperCase();
  const riskMultiplier = LOCATION_RISK_PREMIUM_MULTIPLIERS[normalisedRiskCategory];

  if (riskMultiplier === undefined) {
    console.warn(
      `Unrecognised location risk category: "${locationRiskCategory}". ` +
        `Defaulting to MODERATE_RISK_ZONE multiplier.`
    );
    return LOCATION_RISK_PREMIUM_MULTIPLIERS.MODERATE_RISK_ZONE;
  }

  return riskMultiplier;
}

/**
 * Calculates the final weekly premium in INR for a delivery partner
 * by combining the base plan premium with the location risk multiplier.
 *
 * Formula:
 *   adjustedWeeklyPremium = basePlanPremium × locationRiskMultiplier
 *
 * The result is rounded to the nearest rupee.
 *
 * @param {string} selectedPlanTier - The plan tier chosen by the delivery
 *   partner ('basic', 'standard', or 'premium').
 * @param {string} locationRiskCategory - The risk category of the delivery
 *   partner's primary operating zone.
 * @returns {{ adjustedWeeklyPremiumInRupees: number, maximumCoverageInRupees: number }}
 *   An object containing the final premium and the corresponding coverage cap.
 */
function calculateAdjustedWeeklyPremium(selectedPlanTier, locationRiskCategory) {
  const planConfiguration = getInsurancePlanConfiguration(selectedPlanTier);
  const locationRiskMultiplier = getRiskMultiplierForLocationCategory(locationRiskCategory);

  const adjustedWeeklyPremiumInRupees = Math.round(
    planConfiguration.weeklyPremiumInRupees * locationRiskMultiplier
  );

  return {
    adjustedWeeklyPremiumInRupees,
    maximumCoverageInRupees: planConfiguration.maximumCoverageInRupees,
  };
}

function getPlatformRiskMultiplier(deliveryPlatformNames = []) {
  if (!Array.isArray(deliveryPlatformNames) || deliveryPlatformNames.length === 0) {
    return PLATFORM_RISK_PREMIUM_MULTIPLIERS.OTHER;
  }

  const multipliers = deliveryPlatformNames.map((platformName) => {
    const normalisedPlatformName = String(platformName).toUpperCase();
    return PLATFORM_RISK_PREMIUM_MULTIPLIERS[normalisedPlatformName]
      || PLATFORM_RISK_PREMIUM_MULTIPLIERS.OTHER;
  });

  const totalMultiplier = multipliers.reduce((runningTotal, multiplier) => {
    return runningTotal + multiplier;
  }, 0);

  return totalMultiplier / multipliers.length;
}

function identifyPersonaEarningsBand(monthlyEarningsInRupees) {
  const earnings = Number(monthlyEarningsInRupees) || 0;
  const personaBands = Object.values(DELIVERY_PARTNER_PERSONA_EARNINGS_BANDS);
  const highestDefinedBandMaximum = Math.max(
    ...personaBands.map((band) => band.monthlyEarningsInRupeesRange[1])
  );

  const matchedBands = personaBands.filter((band) => {
    const [minimum, maximum] = band.monthlyEarningsInRupeesRange;
    const isHighestBandMaximum = maximum === highestDefinedBandMaximum;
    return earnings >= minimum && (isHighestBandMaximum ? earnings <= maximum : earnings < maximum);
  });

  if (matchedBands.length > 0) {
    return matchedBands.sort((leftBand, rightBand) => {
      return rightBand.monthlyEarningsInRupeesRange[0] - leftBand.monthlyEarningsInRupeesRange[0];
    })[0];
  }

  return DELIVERY_PARTNER_PERSONA_EARNINGS_BANDS.MID_TIER;
}

function resolveSeasonalRiskMultiplier(calculationDate = new Date()) {
  const month = calculationDate.getUTCMonth() + 1;

  // Monsoon risk window (India-focused): Jun-Sep.
  if (month >= 6 && month <= 9) {
    return {
      seasonalRiskPeriod: 'monsoon',
      seasonalRiskMultiplier: SEASONAL_RISK_PREMIUM_MULTIPLIERS.MONSOON,
    };
  }

  // Peak heat window: Apr-May.
  if (month >= 4 && month <= 5) {
    return {
      seasonalRiskPeriod: 'summer_heat',
      seasonalRiskMultiplier: SEASONAL_RISK_PREMIUM_MULTIPLIERS.SUMMER_HEAT,
    };
  }

  return {
    seasonalRiskPeriod: 'default',
    seasonalRiskMultiplier: SEASONAL_RISK_PREMIUM_MULTIPLIERS.DEFAULT,
  };
}

function calculateProjectedLossRatio({
  weeklyPremiumInRupees,
  weeklyCoverageInRupees,
  expectedPayoutSeverityRatio = PREMIUM_MODEL_ASSUMPTIONS.EXPECTED_PAYOUT_SEVERITY_RATIO,
}) {
  if (weeklyPremiumInRupees <= 0) {
    return 0;
  }

  const expectedWeeklyPayoutAmountInRupees = weeklyCoverageInRupees * expectedPayoutSeverityRatio;
  return Number((expectedWeeklyPayoutAmountInRupees / weeklyPremiumInRupees).toFixed(2));
}

function calculateContextualWeeklyPremium({
  selectedPlanTier,
  locationRiskCategory,
  deliveryPlatformNames,
  averageMonthlyEarningsInRupees,
  calculationDate,
}) {
  const planConfiguration = getInsurancePlanConfiguration(selectedPlanTier);
  const locationRiskMultiplier = getRiskMultiplierForLocationCategory(locationRiskCategory);
  const platformRiskMultiplier = getPlatformRiskMultiplier(deliveryPlatformNames);
  const earningsBand = identifyPersonaEarningsBand(averageMonthlyEarningsInRupees);
  const { seasonalRiskPeriod, seasonalRiskMultiplier } =
    resolveSeasonalRiskMultiplier(calculationDate);

  const weeklyEarningsEstimateInRupees = Math.round(
    (earningsBand.averageDailyEarningsInRupees * PREMIUM_MODEL_ASSUMPTIONS.WORKING_DAYS_PER_WEEK)
  );
  const suggestedCoverageFromEarningsInRupees = Math.round(
    weeklyEarningsEstimateInRupees
      * PREMIUM_MODEL_ASSUMPTIONS.COVERAGE_PROTECTION_RATIO_OF_WEEKLY_EARNINGS
  );

  const basePremiumBeforeLoadings = planConfiguration.weeklyPremiumInRupees
    * locationRiskMultiplier
    * platformRiskMultiplier
    * seasonalRiskMultiplier;
  const adjustedWeeklyPremiumInRupees = Math.round(
    basePremiumBeforeLoadings * (1 + PREMIUM_MODEL_ASSUMPTIONS.LOSS_RATIO_LOADING_FACTOR)
  );

  const projectedLossRatio = calculateProjectedLossRatio({
    weeklyPremiumInRupees: adjustedWeeklyPremiumInRupees,
    weeklyCoverageInRupees: planConfiguration.maximumCoverageInRupees,
  });

  const lossRatioAssessment = projectedLossRatio > LOSS_RATIO_GUARDRAILS.MAXIMUM_SUSTAINABLE_LOSS_RATIO
    ? 'above_sustainable_band'
    : projectedLossRatio < LOSS_RATIO_GUARDRAILS.MINIMUM_SUSTAINABLE_LOSS_RATIO
      ? 'below_sustainable_band'
      : 'within_sustainable_band';

  return {
    adjustedWeeklyPremiumInRupees,
    maximumCoverageInRupees: planConfiguration.maximumCoverageInRupees,
    pricingJustification: {
      weeklyEarningsEstimateInRupees,
      suggestedCoverageFromEarningsInRupees,
      locationRiskMultiplier: Number(locationRiskMultiplier.toFixed(2)),
      platformRiskMultiplier: Number(platformRiskMultiplier.toFixed(2)),
      seasonalRiskPeriod,
      seasonalRiskMultiplier: Number(seasonalRiskMultiplier.toFixed(2)),
      targetLossRatio: LOSS_RATIO_GUARDRAILS.TARGET_LOSS_RATIO,
      projectedLossRatio,
      lossRatioAssessment,
    },
  };
}

/**
 * Calculates the pro-rated daily premium for partial-week policy periods.
 *
 * Useful when a delivery partner subscribes mid-week and should only
 * be charged for the remaining days of the week.
 *
 * @param {number} adjustedWeeklyPremiumInRupees - The full weekly premium.
 * @param {number} remainingDaysInPolicyWeek - Number of days remaining in
 *   the current insurance week (1–7).
 * @returns {number} The pro-rated premium in rupees, rounded to the nearest rupee.
 */
function calculateProRatedPremiumForRemainingDays(
  adjustedWeeklyPremiumInRupees,
  remainingDaysInPolicyWeek
) {
  const DAYS_IN_AN_INSURANCE_WEEK = 7;
  const dailyPremiumInRupees = adjustedWeeklyPremiumInRupees / DAYS_IN_AN_INSURANCE_WEEK;
  return Math.round(dailyPremiumInRupees * remainingDaysInPolicyWeek);
}

module.exports = {
  calculateAdjustedWeeklyPremium,
  calculateContextualWeeklyPremium,
  calculateProjectedLossRatio,
  calculateProRatedPremiumForRemainingDays,
  getInsurancePlanConfiguration,
  getRiskMultiplierForLocationCategory,
  getPlatformRiskMultiplier,
  identifyPersonaEarningsBand,
  resolveSeasonalRiskMultiplier,
};
