/**
 * Disruption threshold checker service.
 *
 * Evaluates real-time environmental data (rainfall, temperature, AQI, LPG shortage index)
 * against the predefined parametric trigger thresholds and determines
 * whether the conditions qualify as a compensable disruption event.
 */

const {
  DISRUPTION_TRIGGER_THRESHOLDS,
  DISRUPTION_EVENT_TYPES,
  PREMIUM_MODEL_ASSUMPTIONS,
} = require('../config/parametricInsuranceConstants');

/**
 * Checks whether the measured rainfall exceeds the heavy-rain
 * parametric trigger threshold.
 *
 * @param {number} measuredRainfallInMillimetres - Current rainfall reading.
 * @returns {boolean} True if rainfall exceeds the trigger threshold.
 */
function isRainfallAboveHeavyRainThreshold(measuredRainfallInMillimetres) {
  return measuredRainfallInMillimetres > DISRUPTION_TRIGGER_THRESHOLDS.RAINFALL_MILLIMETRES;
}

/**
 * Checks whether the measured temperature exceeds the extreme-heat
 * parametric trigger threshold.
 *
 * @param {number} measuredTemperatureInCelsius - Current temperature reading.
 * @returns {boolean} True if temperature exceeds the trigger threshold.
 */
function isTemperatureAboveExtremeHeatThreshold(measuredTemperatureInCelsius) {
  return measuredTemperatureInCelsius > DISRUPTION_TRIGGER_THRESHOLDS.TEMPERATURE_CELSIUS;
}

/**
 * Checks whether the measured Air Quality Index exceeds the hazardous
 * pollution parametric trigger threshold.
 *
 * @param {number} measuredAirQualityIndex - Current AQI reading.
 * @returns {boolean} True if AQI exceeds the trigger threshold.
 */
function isAirQualityIndexAboveHazardousThreshold(measuredAirQualityIndex) {
  return measuredAirQualityIndex > DISRUPTION_TRIGGER_THRESHOLDS.AIR_QUALITY_INDEX;
}

/**
 * Checks whether the measured LPG shortage severity exceeds the
 * parametric trigger threshold.
 *
 * @param {number} measuredLpgShortageSeverityIndex - Current LPG shortage severity index.
 * @returns {boolean} True if LPG shortage severity exceeds the trigger threshold.
 */
function isLpgShortageSeverityAboveThreshold(measuredLpgShortageSeverityIndex) {
  return measuredLpgShortageSeverityIndex
    > DISRUPTION_TRIGGER_THRESHOLDS.LPG_SHORTAGE_SEVERITY_INDEX;
}

/**
 * Evaluates an environmental data reading and returns all disruption
 * event types whose thresholds have been exceeded.
 *
 * @param {object} currentEnvironmentalConditions - Real-time sensor data.
 * @param {number} [currentEnvironmentalConditions.rainfallInMillimetres]
 * @param {number} [currentEnvironmentalConditions.temperatureInCelsius]
 * @param {number} [currentEnvironmentalConditions.airQualityIndex]
 * @param {number} [currentEnvironmentalConditions.lpgShortageSeverityIndex]
 * @returns {string[]} Array of DISRUPTION_EVENT_TYPES values that were triggered.
 */
function identifyTriggeredDisruptionEventTypes(currentEnvironmentalConditions) {
  const triggeredDisruptionTypes = [];

  const {
    rainfallInMillimetres,
    temperatureInCelsius,
    airQualityIndex,
    lpgShortageSeverityIndex,
  } = currentEnvironmentalConditions;

  if (
    rainfallInMillimetres !== undefined &&
    isRainfallAboveHeavyRainThreshold(rainfallInMillimetres)
  ) {
    triggeredDisruptionTypes.push(DISRUPTION_EVENT_TYPES.HEAVY_RAINFALL);
  }

  if (
    temperatureInCelsius !== undefined &&
    isTemperatureAboveExtremeHeatThreshold(temperatureInCelsius)
  ) {
    triggeredDisruptionTypes.push(DISRUPTION_EVENT_TYPES.EXTREME_HEAT);
  }

  if (
    airQualityIndex !== undefined &&
    isAirQualityIndexAboveHazardousThreshold(airQualityIndex)
  ) {
    triggeredDisruptionTypes.push(DISRUPTION_EVENT_TYPES.HAZARDOUS_AIR_QUALITY);
  }

  if (
    lpgShortageSeverityIndex !== undefined &&
    isLpgShortageSeverityAboveThreshold(lpgShortageSeverityIndex)
  ) {
    triggeredDisruptionTypes.push(DISRUPTION_EVENT_TYPES.LPG_SHORTAGE);
  }

  return triggeredDisruptionTypes;
}

/**
 * Calculates how far the measured value is above the trigger threshold,
 * expressed as a severity ratio.  This ratio is used to determine the
 * proportion of maximum coverage to disburse as compensation.
 *
 * A ratio of 1.0 means the condition is exactly at threshold.
 * A ratio > 1.0 means the condition has exceeded the threshold proportionally.
 * The returned value is capped at 1.0 (i.e. full coverage) for very severe events.
 *
 * @param {number} measuredValue - The current sensor reading.
 * @param {number} parametricThresholdValue - The defined trigger threshold.
 * @returns {number} Severity ratio clamped to [0, 1].
 */
function calculateDisruptionSeverityRatio(measuredValue, parametricThresholdValue) {
  if (measuredValue <= parametricThresholdValue) {
    return 0;
  }
  const exceedanceAboveThreshold = measuredValue - parametricThresholdValue;
  const rawSeverityRatio = exceedanceAboveThreshold / parametricThresholdValue;
  return Math.min(rawSeverityRatio, 1.0);
}

/**
 * Determines the compensation amount based on the disruption severity
 * and the remaining coverage available on the worker's active policy.
 *
 * @param {number} disruptionSeverityRatio - Value in [0, 1] from
 *   calculateDisruptionSeverityRatio.
 * @param {number} remainingPolicyCoverageInRupees - Remaining coverage balance.
 * @returns {number} Recommended compensation amount in rupees.
 */
function determineCompensationAmountForDisruption(
  disruptionSeverityRatio,
  remainingPolicyCoverageInRupees
) {
  const clampedSeverityRatio = Math.max(0, Math.min(1, Number(disruptionSeverityRatio) || 0));

  if (clampedSeverityRatio <= 0 || remainingPolicyCoverageInRupees <= 0) {
    return 0;
  }

  const boundedPayoutRatio = Math.max(
    PREMIUM_MODEL_ASSUMPTIONS.MINIMUM_DISRUPTION_PAYOUT_RATIO,
    Math.min(PREMIUM_MODEL_ASSUMPTIONS.MAXIMUM_DISRUPTION_PAYOUT_RATIO, clampedSeverityRatio)
  );

  const boundedCompensationInRupees = Math.round(
    boundedPayoutRatio * remainingPolicyCoverageInRupees
  );

  return Math.min(boundedCompensationInRupees, remainingPolicyCoverageInRupees);
}

module.exports = {
  isRainfallAboveHeavyRainThreshold,
  isTemperatureAboveExtremeHeatThreshold,
  isAirQualityIndexAboveHazardousThreshold,
  isLpgShortageSeverityAboveThreshold,
  identifyTriggeredDisruptionEventTypes,
  calculateDisruptionSeverityRatio,
  determineCompensationAmountForDisruption,
};
