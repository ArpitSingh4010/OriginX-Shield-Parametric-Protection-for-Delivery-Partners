/**
 * Parametric trigger thresholds that determine when a disruption event
 * is severe enough to automatically initiate a payout for delivery partners.
 *
 * Values are based on the GigShield policy specification:
 *   - Rainfall threshold: 50 mm triggers compensation for heavy rain
 *   - Temperature threshold: 42 °C triggers compensation for extreme heat
 *   - AQI threshold: 300 triggers compensation for hazardous air quality
 */

const DISRUPTION_TRIGGER_THRESHOLDS = {
  RAINFALL_MILLIMETRES: 50,
  TEMPERATURE_CELSIUS: 42,
  AIR_QUALITY_INDEX: 300,
};

/**
 * Weekly insurance plan definitions.
 * Each plan specifies the weekly premium (in INR) and the maximum
 * coverage amount the worker can receive in a given week.
 */
const WEEKLY_INSURANCE_PLANS = {
  BASIC: {
    planName: 'Basic',
    weeklyPremiumInRupees: 25,
    maximumCoverageInRupees: 300,
  },
  STANDARD: {
    planName: 'Standard',
    weeklyPremiumInRupees: 40,
    maximumCoverageInRupees: 500,
  },
  PREMIUM: {
    planName: 'Premium',
    weeklyPremiumInRupees: 60,
    maximumCoverageInRupees: 700,
  },
};

/**
 * Multipliers applied to base premiums depending on the assessed
 * risk level of the delivery partner's primary operating zone.
 */
const LOCATION_RISK_PREMIUM_MULTIPLIERS = {
  LOW_RISK_ZONE: 1.0,
  MODERATE_RISK_ZONE: 1.2,
  HIGH_RISK_ZONE: 1.5,
  VERY_HIGH_RISK_ZONE: 1.8,
};

/**
 * Platform-specific multipliers based on observed volatility in order volume,
 * interruption frequency, and earning consistency for delivery partners.
 */
const PLATFORM_RISK_PREMIUM_MULTIPLIERS = {
  SWIGGY: 1.05,
  ZOMATO: 1.03,
  DUNZO: 1.1,
  BLINKIT: 1.12,
  OTHER: 1.0,
};

/**
 * Persona earnings benchmarks (monthly and daily) used to justify plan
 * suitability and recommended coverage caps.
 */
const DELIVERY_PARTNER_PERSONA_EARNINGS_BANDS = {
  ENTRY_LEVEL: {
    monthlyEarningsInRupeesRange: [15000, 22000],
    averageDailyEarningsInRupees: 700,
  },
  MID_TIER: {
    monthlyEarningsInRupeesRange: [22000, 32000],
    averageDailyEarningsInRupees: 1000,
  },
  HIGH_ACTIVITY: {
    monthlyEarningsInRupeesRange: [32000, 45000],
    averageDailyEarningsInRupees: 1400,
  },
};

/**
 * Loss-ratio guardrails for pricing sustainability.
 */
const LOSS_RATIO_GUARDRAILS = {
  TARGET_LOSS_RATIO: 0.65,
  MAXIMUM_SUSTAINABLE_LOSS_RATIO: 0.8,
  MINIMUM_SUSTAINABLE_LOSS_RATIO: 0.4,
};

/**
 * Key assumptions for weekly premium justification and coverage adequacy.
 */
const PREMIUM_MODEL_ASSUMPTIONS = {
  WORKING_DAYS_PER_WEEK: 6,
  COVERAGE_PROTECTION_RATIO_OF_WEEKLY_EARNINGS: 0.5,
  DEFAULT_EXPECTED_DISRUPTION_DAYS_PER_MONTH: 3,
  EXPECTED_PAYOUT_SEVERITY_RATIO: 0.3,
  LOSS_RATIO_LOADING_FACTOR: 0.1,
};

/**
 * Exclusions that must be transparently declared in policy documentation.
 */
const COVERAGE_EXCLUSIONS = {
  WAR_OR_HOSTILITIES: 'war_or_hostilities',
  PANDEMIC_OR_EPIDEMIC: 'pandemic_or_epidemic',
};

/**
 * Possible states for an insurance claim throughout its lifecycle.
 */
const INSURANCE_CLAIM_STATUSES = {
  PENDING_VERIFICATION: 'pending_verification',
  VERIFICATION_IN_PROGRESS: 'verification_in_progress',
  APPROVED_FOR_PAYOUT: 'approved_for_payout',
  PAYOUT_PROCESSED: 'payout_processed',
  FLAGGED_FOR_MANUAL_REVIEW: 'flagged_for_manual_review',
  REJECTED: 'rejected',
};

/**
 * Possible states for a delivery partner's insurance policy.
 */
const INSURANCE_POLICY_STATUSES = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  SUSPENDED: 'suspended',
};

/**
 * Types of disruption events that can trigger automatic compensation.
 */
const DISRUPTION_EVENT_TYPES = {
  HEAVY_RAINFALL: 'heavy_rainfall',
  EXTREME_HEAT: 'extreme_heat',
  HAZARDOUS_AIR_QUALITY: 'hazardous_air_quality',
  AREA_CURFEW: 'area_curfew',
  FLOODING: 'flooding',
};

/**
 * Fraud detection thresholds used by the anomaly detection service
 * to identify suspicious claim patterns.
 */
const FRAUD_DETECTION_THRESHOLDS = {
  MAXIMUM_CLAIMS_PER_WEEK: 3,
  SUSPICIOUS_CLAIM_FREQUENCY_THRESHOLD: 5,
  MINIMUM_ACTIVE_DELIVERY_MINUTES_REQUIRED: 30,
  MAXIMUM_ALLOWED_LOCATION_DISCREPANCY_KILOMETRES: 2,
};

module.exports = {
  DISRUPTION_TRIGGER_THRESHOLDS,
  WEEKLY_INSURANCE_PLANS,
  LOCATION_RISK_PREMIUM_MULTIPLIERS,
  PLATFORM_RISK_PREMIUM_MULTIPLIERS,
  DELIVERY_PARTNER_PERSONA_EARNINGS_BANDS,
  LOSS_RATIO_GUARDRAILS,
  PREMIUM_MODEL_ASSUMPTIONS,
  COVERAGE_EXCLUSIONS,
  INSURANCE_CLAIM_STATUSES,
  INSURANCE_POLICY_STATUSES,
  DISRUPTION_EVENT_TYPES,
  FRAUD_DETECTION_THRESHOLDS,
};
