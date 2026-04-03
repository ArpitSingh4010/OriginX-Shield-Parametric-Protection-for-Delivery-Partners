/**
 * Unit tests for the disruption threshold checker service.
 *
 * Verifies that each environmental threshold check correctly identifies
 * when parametric trigger conditions have been met, and that severity
 * and compensation calculations are accurate.
 */

const {
  isRainfallAboveHeavyRainThreshold,
  isTemperatureAboveExtremeHeatThreshold,
  isAirQualityIndexAboveHazardousThreshold,
  isLpgShortageSeverityAboveThreshold,
  identifyTriggeredDisruptionEventTypes,
  calculateDisruptionSeverityRatio,
  determineCompensationAmountForDisruption,
} = require('../services/disruptionThresholdChecker');

const { DISRUPTION_EVENT_TYPES } = require('../config/parametricInsuranceConstants');

describe('isRainfallAboveHeavyRainThreshold', () => {
  test('returns true when rainfall exceeds 50 mm threshold', () => {
    expect(isRainfallAboveHeavyRainThreshold(75)).toBe(true);
  });

  test('returns false when rainfall is exactly at the 50 mm threshold', () => {
    expect(isRainfallAboveHeavyRainThreshold(50)).toBe(false);
  });

  test('returns false when rainfall is below threshold', () => {
    expect(isRainfallAboveHeavyRainThreshold(20)).toBe(false);
  });
});

describe('isTemperatureAboveExtremeHeatThreshold', () => {
  test('returns true when temperature exceeds 42°C threshold', () => {
    expect(isTemperatureAboveExtremeHeatThreshold(45)).toBe(true);
  });

  test('returns false when temperature is exactly at the 42°C threshold', () => {
    expect(isTemperatureAboveExtremeHeatThreshold(42)).toBe(false);
  });

  test('returns false when temperature is below threshold', () => {
    expect(isTemperatureAboveExtremeHeatThreshold(35)).toBe(false);
  });
});

describe('isAirQualityIndexAboveHazardousThreshold', () => {
  test('returns true when AQI exceeds 300 threshold', () => {
    expect(isAirQualityIndexAboveHazardousThreshold(350)).toBe(true);
  });

  test('returns false when AQI is exactly at the 300 threshold', () => {
    expect(isAirQualityIndexAboveHazardousThreshold(300)).toBe(false);
  });

  test('returns false when AQI is below threshold', () => {
    expect(isAirQualityIndexAboveHazardousThreshold(150)).toBe(false);
  });
});

describe('isLpgShortageSeverityAboveThreshold', () => {
  test('returns true when LPG shortage severity exceeds 70 threshold', () => {
    expect(isLpgShortageSeverityAboveThreshold(80)).toBe(true);
  });

  test('returns false when LPG shortage severity is exactly at the 70 threshold', () => {
    expect(isLpgShortageSeverityAboveThreshold(70)).toBe(false);
  });

  test('returns false when LPG shortage severity is below threshold', () => {
    expect(isLpgShortageSeverityAboveThreshold(40)).toBe(false);
  });
});

describe('identifyTriggeredDisruptionEventTypes', () => {
  test('returns heavy rainfall type when only rainfall threshold is exceeded', () => {
    const triggeredTypes = identifyTriggeredDisruptionEventTypes({
      rainfallInMillimetres: 80,
      temperatureInCelsius: 30,
      airQualityIndex: 100,
      lpgShortageSeverityIndex: 20,
    });

    expect(triggeredTypes).toContain(DISRUPTION_EVENT_TYPES.HEAVY_RAINFALL);
    expect(triggeredTypes).not.toContain(DISRUPTION_EVENT_TYPES.EXTREME_HEAT);
    expect(triggeredTypes).not.toContain(DISRUPTION_EVENT_TYPES.HAZARDOUS_AIR_QUALITY);
    expect(triggeredTypes).not.toContain(DISRUPTION_EVENT_TYPES.LPG_SHORTAGE);
  });

  test('returns all four types when all thresholds are exceeded simultaneously', () => {
    const triggeredTypes = identifyTriggeredDisruptionEventTypes({
      rainfallInMillimetres: 100,
      temperatureInCelsius: 45,
      airQualityIndex: 400,
      lpgShortageSeverityIndex: 90,
    });

    expect(triggeredTypes).toContain(DISRUPTION_EVENT_TYPES.HEAVY_RAINFALL);
    expect(triggeredTypes).toContain(DISRUPTION_EVENT_TYPES.EXTREME_HEAT);
    expect(triggeredTypes).toContain(DISRUPTION_EVENT_TYPES.HAZARDOUS_AIR_QUALITY);
    expect(triggeredTypes).toContain(DISRUPTION_EVENT_TYPES.LPG_SHORTAGE);
  });

  test('returns empty array when no thresholds are exceeded', () => {
    const triggeredTypes = identifyTriggeredDisruptionEventTypes({
      rainfallInMillimetres: 10,
      temperatureInCelsius: 25,
      airQualityIndex: 100,
      lpgShortageSeverityIndex: 10,
    });

    expect(triggeredTypes).toHaveLength(0);
  });

  test('ignores undefined environmental condition values', () => {
    const triggeredTypes = identifyTriggeredDisruptionEventTypes({
      temperatureInCelsius: 45,
      lpgShortageSeverityIndex: 80,
    });

    expect(triggeredTypes).toContain(DISRUPTION_EVENT_TYPES.EXTREME_HEAT);
    expect(triggeredTypes).toContain(DISRUPTION_EVENT_TYPES.LPG_SHORTAGE);
    expect(triggeredTypes).not.toContain(DISRUPTION_EVENT_TYPES.HEAVY_RAINFALL);
  });
});

describe('calculateDisruptionSeverityRatio', () => {
  test('returns 0 when measured value is at or below the threshold', () => {
    expect(calculateDisruptionSeverityRatio(50, 50)).toBe(0);
    expect(calculateDisruptionSeverityRatio(30, 50)).toBe(0);
  });

  test('returns a positive ratio when measured value exceeds the threshold', () => {
    const severityRatio = calculateDisruptionSeverityRatio(75, 50);
    expect(severityRatio).toBeGreaterThan(0);
    expect(severityRatio).toBeLessThanOrEqual(1);
  });

  test('caps the severity ratio at 1.0 for very extreme values', () => {
    expect(calculateDisruptionSeverityRatio(200, 50)).toBe(1.0);
  });
});

describe('determineCompensationAmountForDisruption', () => {
  test('applies minimum payout floor when severity is below floor but above zero', () => {
    const compensationAmount = determineCompensationAmountForDisruption(0.1, 500);
    expect(compensationAmount).toBe(200);
  });

  test('returns correct compensation for given severity and coverage', () => {
    const compensationAmount = determineCompensationAmountForDisruption(0.5, 500);
    expect(compensationAmount).toBe(250);
  });

  test('caps payout at configured maximum disruption payout ratio', () => {
    const compensationAmount = determineCompensationAmountForDisruption(1.0, 300);
    expect(compensationAmount).toBe(180);
  });

  test('returns 0 when severity ratio is 0', () => {
    expect(determineCompensationAmountForDisruption(0, 500)).toBe(0);
  });
});
