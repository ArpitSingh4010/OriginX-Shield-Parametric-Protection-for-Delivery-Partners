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
  INSURANCE_CLAIM_STATUSES,
  INSURANCE_POLICY_STATUSES,
  DISRUPTION_EVENT_TYPES,
  FRAUD_DETECTION_THRESHOLDS,
};
