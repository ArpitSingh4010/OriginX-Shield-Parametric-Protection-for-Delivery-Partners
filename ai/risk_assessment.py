"""
risk_assessment.py  (ML-enhanced)
───────────────────────────────────
Calculates a location-based risk score for each delivery zone.

Approach:
  • Primary scorer : RandomForestRegressor loaded from
                     ai/models/risk_regressor.pkl
  • Fallback scorer: Original deterministic weighted formula
  • Both scores are returned so callers can compare.
"""

from __future__ import annotations

import os
import warnings
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional

# ── ML model loading ───────────────────────────────────────────────────────────

_RISK_MODEL = None
_RISK_MODEL_LOAD_ERROR: Optional[str] = None

def _load_risk_model():
    global _RISK_MODEL, _RISK_MODEL_LOAD_ERROR
    try:
        import joblib
        model_path = os.path.join(os.path.dirname(__file__), "models", "risk_regressor.pkl")
        if os.path.exists(model_path):
            _RISK_MODEL = joblib.load(model_path)
            print(f"[RiskAssessment] ML model loaded from {model_path}")
        else:
            _RISK_MODEL_LOAD_ERROR = f"Model file not found: {model_path}"
            print(f"[RiskAssessment] WARNING: {_RISK_MODEL_LOAD_ERROR}  ->  using deterministic fallback")
    except Exception as exc:
        _RISK_MODEL_LOAD_ERROR = str(exc)
        print(f"[RiskAssessment] WARNING: ML model load failed: {exc}  ->  using deterministic fallback")

_load_risk_model()

# Feature order must match RISK_FEATURES in train_models.py
_RISK_FEATURE_ORDER = [
    "claims_last_7_days",
    "city_base_risk_score",
    "rainfall_mm",
    "temperature_c",
    "aqi",
]

# ── Enumerations & data classes ────────────────────────────────────────────────

class LocationRiskCategory(str, Enum):
    """Enumeration of risk categories assigned to delivery zones."""
    LOW_RISK_ZONE       = "low_risk_zone"
    MODERATE_RISK_ZONE  = "moderate_risk_zone"
    HIGH_RISK_ZONE      = "high_risk_zone"
    VERY_HIGH_RISK_ZONE = "very_high_risk_zone"


@dataclass
class HistoricalDisruptionRecord:
    """Represents a single historical disruption event."""
    disruption_type: str
    rainfall_in_millimetres: float = 0.0
    temperature_in_celsius: float  = 0.0
    air_quality_index: float       = 0.0
    duration_in_hours: float       = 0.0
    estimated_income_loss_percentage: float = 0.0


@dataclass
class DeliveryZoneRiskProfile:
    """Encapsulates the risk assessment output for a specific delivery zone."""
    zone_city_name: str
    zone_centre_latitude: float
    zone_centre_longitude: float
    computed_risk_score: float
    rule_based_risk_score: float
    ml_predicted_risk_score: Optional[float]
    detection_method: str                    # "ml" | "rule_based"
    assigned_risk_category: LocationRiskCategory
    historical_disruption_records: List[HistoricalDisruptionRecord] = field(
        default_factory=list
    )


# ── Thresholds ─────────────────────────────────────────────────────────────────

RISK_SCORE_THRESHOLD_FOR_LOW_CATEGORY      = 0.25
RISK_SCORE_THRESHOLD_FOR_MODERATE_CATEGORY = 0.50
RISK_SCORE_THRESHOLD_FOR_HIGH_CATEGORY     = 0.75


# ── Deterministic helpers (original rule engine — preserved as fallback) ───────

def calculate_average_disruption_frequency_per_week(
    historical_disruption_records: List[HistoricalDisruptionRecord],
    observation_period_in_weeks: int,
) -> float:
    if observation_period_in_weeks <= 0:
        return 0.0
    return len(historical_disruption_records) / observation_period_in_weeks


def calculate_average_estimated_income_loss_percentage(
    historical_disruption_records: List[HistoricalDisruptionRecord],
) -> float:
    if not historical_disruption_records:
        return 0.0
    return sum(r.estimated_income_loss_percentage for r in historical_disruption_records) / len(
        historical_disruption_records
    )


def normalise_value_to_zero_one_range(
    raw_value: float, minimum_expected_value: float, maximum_expected_value: float
) -> float:
    if maximum_expected_value <= minimum_expected_value:
        return 0.0
    normalised = (raw_value - minimum_expected_value) / (maximum_expected_value - minimum_expected_value)
    return max(0.0, min(1.0, normalised))


def compute_rule_based_location_risk_score(
    average_weekly_disruption_frequency: float,
    average_income_loss_percentage: float,
    frequency_weight: float = 0.6,
    severity_weight: float  = 0.4,
) -> float:
    MAX_EXPECTED_WEEKLY_DISRUPTIONS    = 5.0
    MAX_EXPECTED_INCOME_LOSS_PERCENTAGE = 100.0

    norm_freq = normalise_value_to_zero_one_range(
        average_weekly_disruption_frequency, 0.0, MAX_EXPECTED_WEEKLY_DISRUPTIONS
    )
    norm_sev = normalise_value_to_zero_one_range(
        average_income_loss_percentage, 0.0, MAX_EXPECTED_INCOME_LOSS_PERCENTAGE
    )
    return round(frequency_weight * norm_freq + severity_weight * norm_sev, 4)


def classify_risk_score_into_location_category(computed_risk_score: float) -> LocationRiskCategory:
    if computed_risk_score <= RISK_SCORE_THRESHOLD_FOR_LOW_CATEGORY:
        return LocationRiskCategory.LOW_RISK_ZONE
    elif computed_risk_score <= RISK_SCORE_THRESHOLD_FOR_MODERATE_CATEGORY:
        return LocationRiskCategory.MODERATE_RISK_ZONE
    elif computed_risk_score <= RISK_SCORE_THRESHOLD_FOR_HIGH_CATEGORY:
        return LocationRiskCategory.HIGH_RISK_ZONE
    else:
        return LocationRiskCategory.VERY_HIGH_RISK_ZONE


# ── ML risk predictor ──────────────────────────────────────────────────────────

def _predict_ml_risk_score(
    historical_disruption_records: List[HistoricalDisruptionRecord],
    observation_period_in_weeks: int,
    city_base_risk_score: float = 0.30,
) -> Optional[float]:
    """
    Uses the loaded RandomForestRegressor to predict the location risk score.
    Returns None if the model is unavailable.
    """
    if _RISK_MODEL is None:
        return None

    try:
        import numpy as np

        avg_weekly = calculate_average_disruption_frequency_per_week(
            historical_disruption_records, observation_period_in_weeks
        )
        avg_rainfall = (
            sum(r.rainfall_in_millimetres for r in historical_disruption_records) /
            max(len(historical_disruption_records), 1)
        )
        avg_temp = (
            sum(r.temperature_in_celsius for r in historical_disruption_records) /
            max(len(historical_disruption_records), 1)
        )
        avg_aqi = (
            sum(r.air_quality_index for r in historical_disruption_records) /
            max(len(historical_disruption_records), 1)
        )

        # Feature order: claims_last_7_days, city_base_risk_score, rainfall_mm, temperature_c, aqi
        feature_vector = [
            avg_weekly,          # proxy for disruption frequency
            city_base_risk_score,
            avg_rainfall,
            avg_temp,
            avg_aqi,
        ]
        X = numpy_array = __import__('numpy').array([feature_vector])
        score = float(_RISK_MODEL.predict(X)[0])
        return round(max(0.0, min(1.0, score)), 4)
    except Exception as exc:
        warnings.warn(f"ML risk prediction failed: {exc}; falling back to rule engine.")
        return None


# ── Main entry point ───────────────────────────────────────────────────────────

def assess_delivery_zone_risk_profile(
    zone_city_name: str,
    zone_centre_latitude: float,
    zone_centre_longitude: float,
    historical_disruption_records: List[HistoricalDisruptionRecord],
    observation_period_in_weeks: int = 52,
    city_base_risk_score: float = 0.30,
) -> DeliveryZoneRiskProfile:
    """
    Performs a complete risk assessment for a delivery zone.

    Uses the RandomForestRegressor as primary scorer when available,
    falls back to the deterministic weighted formula otherwise.
    """
    avg_weekly_freq = calculate_average_disruption_frequency_per_week(
        historical_disruption_records, observation_period_in_weeks
    )
    avg_income_loss = calculate_average_estimated_income_loss_percentage(
        historical_disruption_records
    )

    # Rule-based score (always computed for transparency)
    rule_score = compute_rule_based_location_risk_score(avg_weekly_freq, avg_income_loss)

    # ML score (when available)
    ml_score = _predict_ml_risk_score(
        historical_disruption_records, observation_period_in_weeks, city_base_risk_score
    )

    if ml_score is not None:
        # Blend: 60 % ML, 40 % rules
        computed_score = round(0.60 * ml_score + 0.40 * rule_score, 4)
        detection_method = "ml"
    else:
        computed_score = rule_score
        detection_method = "rule_based"

    assigned_category = classify_risk_score_into_location_category(computed_score)

    return DeliveryZoneRiskProfile(
        zone_city_name=zone_city_name,
        zone_centre_latitude=zone_centre_latitude,
        zone_centre_longitude=zone_centre_longitude,
        computed_risk_score=computed_score,
        rule_based_risk_score=rule_score,
        ml_predicted_risk_score=ml_score,
        detection_method=detection_method,
        assigned_risk_category=assigned_category,
        historical_disruption_records=historical_disruption_records,
    )
