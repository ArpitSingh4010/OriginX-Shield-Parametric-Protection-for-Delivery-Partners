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
  calculateProRatedPremiumForRemainingDays,
  getInsurancePlanConfiguration,
  getRiskMultiplierForLocationCategory,
};
