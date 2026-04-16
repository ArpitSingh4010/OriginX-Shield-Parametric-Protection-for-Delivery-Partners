"""
anomaly_detector.py  (ML-enhanced)
────────────────────────────────────
Analyses claim submissions to identify potentially fraudulent activity.

Detection approach — ML Ensemble:
  • Primary scorer : GradientBoostingClassifier loaded from
                     ai/models/fraud_classifier.pkl
  • Fallback scorer: Deterministic rule engine (original logic)
  • Final score    : 0.70 × ML  +  0.30 × Rules  (when ML available)
                     1.00 × Rules                 (when model not loaded)

The response always includes both the ML probability and each rule's
individual result so decisions remain interpretable and auditable.
"""

from __future__ import annotations

import os
import warnings
from dataclasses import dataclass, field
from typing import List, Optional

# ── ML model loading ───────────────────────────────────────────────────────────

_ML_MODEL = None
_ML_MODEL_LOAD_ERROR: Optional[str] = None

def _load_fraud_model():
    """Attempt to load the trained GradientBoostingClassifier from disk."""
    global _ML_MODEL, _ML_MODEL_LOAD_ERROR
    try:
        import joblib
        model_path = os.path.join(os.path.dirname(__file__), "models", "fraud_classifier.pkl")
        if os.path.exists(model_path):
            _ML_MODEL = joblib.load(model_path)
            print(f"[AnomalyDetector] ML model loaded from {model_path}")
        else:
            _ML_MODEL_LOAD_ERROR = f"Model file not found: {model_path}"
            print(f"[AnomalyDetector] WARNING: {_ML_MODEL_LOAD_ERROR}  ->  using rule-based fallback")
    except Exception as exc:
        _ML_MODEL_LOAD_ERROR = str(exc)
        print(f"[AnomalyDetector] WARNING: ML model load failed: {exc}  ->  using rule-based fallback")

_load_fraud_model()

# Feature order must match FRAUD_FEATURES in train_models.py
_ML_FEATURE_ORDER = [
    "claims_last_7_days",
    "distance_from_epicentre_km",
    "activity_ratio",
    "city_base_risk_score",
    "rainfall_mm",
    "temperature_c",
    "aqi",
]

# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class ClaimActivityRecord:
    """
    A lightweight summary of a single historical or current claim used
    as input to the anomaly detection checks.
    """

    claim_id: str
    delivery_partner_id: str
    number_of_claims_filed_in_last_seven_days: int
    partner_reported_latitude_at_claim_time: float
    partner_reported_longitude_at_claim_time: float
    disruption_epicentre_latitude: float
    disruption_epicentre_longitude: float
    minutes_active_on_delivery_platform_during_disruption: int
    disruption_duration_in_minutes: int

    # Optional environmental context (used by ML model; rule engine ignores these)
    city_base_risk_score: float = 0.30
    rainfall_in_millimetres: float = 60.0
    temperature_in_celsius: float = 33.0
    air_quality_index: float = 180.0

    # Advanced fraud detection fields
    # GPS spoofing: previous claim location + hours since that claim
    previous_claim_latitude: Optional[float] = None
    previous_claim_longitude: Optional[float] = None
    hours_since_previous_claim: Optional[float] = None

    # Weather mismatch: official measured values from the disruption event
    event_measured_rainfall_mm: Optional[float] = None
    event_measured_temperature_c: Optional[float] = None
    event_measured_aqi: Optional[float] = None


@dataclass
class AnomalyDetectionReport:
    """
    Contains the outcome of all anomaly detection checks for a single claim.
    """

    claim_id: str
    is_claim_frequency_anomalous: bool
    is_location_mismatch_detected: bool
    is_activity_signal_mismatch_detected: bool
    rule_based_risk_score: float
    ml_fraud_probability: Optional[float]          # None if ML not available
    overall_anomaly_risk_score: float
    should_flag_for_manual_review: bool
    detection_method: str                          # "ml_ensemble" | "rule_based"
    anomaly_detection_notes: List[str] = field(default_factory=list)
    # Advanced fraud flags
    advanced_fraud_flags: List[str] = field(default_factory=list)
    gps_velocity_km_per_hour: Optional[float] = None
    weather_mismatch_percentage: Optional[float] = None


# ── Rule-engine thresholds ─────────────────────────────────────────────────────

MAXIMUM_ACCEPTABLE_CLAIMS_PER_SEVEN_DAYS = 3
MAXIMUM_ACCEPTABLE_DISTANCE_FROM_DISRUPTION_EPICENTRE_KM = 5.0
MINIMUM_ACCEPTABLE_ACTIVITY_RATIO_DURING_DISRUPTION = 0.10
ANOMALY_RISK_SCORE_THRESHOLD_FOR_MANUAL_REVIEW = 0.40

# Ensemble weighting
_ML_WEIGHT   = 0.70
_RULE_WEIGHT = 0.30


# ── Geometry helper ────────────────────────────────────────────────────────────

def calculate_straight_line_distance_in_kilometres(
    latitude_point_a: float,
    longitude_point_a: float,
    latitude_point_b: float,
    longitude_point_b: float,
) -> float:
    """
    Computes the great-circle distance between two geographic coordinates
    using the Haversine formula.
    """
    import math

    EARTH_RADIUS_KILOMETRES = 6371.0

    latitude_difference_radians  = math.radians(latitude_point_b - latitude_point_a)
    longitude_difference_radians = math.radians(longitude_point_b - longitude_point_a)

    haversine_intermediate = (
        math.sin(latitude_difference_radians / 2) ** 2
        + math.cos(math.radians(latitude_point_a))
        * math.cos(math.radians(latitude_point_b))
        * math.sin(longitude_difference_radians / 2) ** 2
    )

    central_angle_radians = 2 * math.atan2(
        math.sqrt(haversine_intermediate), math.sqrt(1 - haversine_intermediate)
    )

    return EARTH_RADIUS_KILOMETRES * central_angle_radians


# ── Rule-engine checks ─────────────────────────────────────────────────────────

def is_claim_frequency_higher_than_acceptable_limit(
    number_of_claims_filed_in_last_seven_days: int,
) -> bool:
    return (
        number_of_claims_filed_in_last_seven_days
        > MAXIMUM_ACCEPTABLE_CLAIMS_PER_SEVEN_DAYS
    )


def is_partner_location_too_far_from_disruption_epicentre(
    partner_reported_latitude: float,
    partner_reported_longitude: float,
    disruption_epicentre_latitude: float,
    disruption_epicentre_longitude: float,
) -> tuple[bool, float]:
    distance_from_epicentre_km = calculate_straight_line_distance_in_kilometres(
        partner_reported_latitude,
        partner_reported_longitude,
        disruption_epicentre_latitude,
        disruption_epicentre_longitude,
    )
    is_location_mismatch_detected = (
        distance_from_epicentre_km
        > MAXIMUM_ACCEPTABLE_DISTANCE_FROM_DISRUPTION_EPICENTRE_KM
    )
    return is_location_mismatch_detected, distance_from_epicentre_km


def is_delivery_platform_activity_inconsistent_with_disruption_window(
    minutes_active_on_platform: int,
    disruption_duration_in_minutes: int,
) -> bool:
    if disruption_duration_in_minutes <= 0:
        return True
    activity_ratio = minutes_active_on_platform / disruption_duration_in_minutes
    return activity_ratio < MINIMUM_ACCEPTABLE_ACTIVITY_RATIO_DURING_DISRUPTION


def compute_rule_based_risk_score(
    is_claim_frequency_anomalous: bool,
    is_location_mismatch_detected: bool,
    is_activity_signal_mismatch_detected: bool,
) -> float:
    """
    Weights: frequency 0.35, location 0.40, activity 0.25.
    """
    accumulated = 0.0
    if is_claim_frequency_anomalous:
        accumulated += 0.35
    if is_location_mismatch_detected:
        accumulated += 0.40
    if is_activity_signal_mismatch_detected:
        accumulated += 0.25
    return min(accumulated, 1.0)


# -- Advanced fraud checks ------------------------------------------------------

# GPS velocity threshold: above this km/h between two consecutive claims
# is physically impossible for road transport (max ~180 km/h highway).
_GPS_VELOCITY_THRESHOLD_KM_PER_HOUR = 200.0

# If the partner's self-reported rainfall is below this fraction of the
# official event measurement, flag as a potential fake weather claim.
_WEATHER_MISMATCH_THRESHOLD_RATIO = 0.40  # partner claims < 40% of measured


def check_gps_velocity_spoofing(
    record: ClaimActivityRecord,
) -> tuple[bool, Optional[float]]:
    """
    Detects impossible GPS travel: if interval between this claim and the
    previous one implies a velocity > _GPS_VELOCITY_THRESHOLD_KM_PER_HOUR,
    the location data is likely spoofed.

    Returns (is_spoofed, velocity_km_per_hour).
    Velocity is None if insufficient data.
    """
    if (
        record.previous_claim_latitude is None
        or record.previous_claim_longitude is None
        or record.hours_since_previous_claim is None
        or record.hours_since_previous_claim <= 0
    ):
        return False, None

    dist_km = calculate_straight_line_distance_in_kilometres(
        record.partner_reported_latitude_at_claim_time,
        record.partner_reported_longitude_at_claim_time,
        record.previous_claim_latitude,
        record.previous_claim_longitude,
    )
    velocity = dist_km / record.hours_since_previous_claim
    is_spoofed = velocity > _GPS_VELOCITY_THRESHOLD_KM_PER_HOUR
    return is_spoofed, round(velocity, 1)


def check_weather_conditions_mismatch(
    record: ClaimActivityRecord,
) -> tuple[bool, Optional[float]]:
    """
    Compares the partner's self-reported rainfall against the official
    disruption event measurement. If the partner's claim is suspiciously
    lower than what was actually measured, the conditions may be fabricated.

    Returns (is_mismatch, mismatch_percentage).
    mismatch_percentage: how far below the official value the claim is.
    """
    if (
        record.event_measured_rainfall_mm is None
        or record.event_measured_rainfall_mm <= 0
    ):
        return False, None

    claimed  = record.rainfall_in_millimetres
    official = record.event_measured_rainfall_mm

    # Partner should be near the event so conditions should be similar.
    # If they claim <40% of the official reading, it's suspicious.
    ratio = claimed / official if official > 0 else 1.0
    is_mismatch = ratio < _WEATHER_MISMATCH_THRESHOLD_RATIO
    mismatch_pct = round((1.0 - ratio) * 100, 1) if is_mismatch else None
    return is_mismatch, mismatch_pct


# ── ML scorer ─────────────────────────────────────────────────────────────────

def _predict_ml_fraud_probability(
    record: ClaimActivityRecord,
    distance_km: float,
) -> Optional[float]:
    """
    Uses the loaded GradientBoostingClassifier to predict P(fraud).
    Returns None if the model is unavailable.
    """
    if _ML_MODEL is None:
        return None

    try:
        import numpy as np
        disruption_duration = max(record.disruption_duration_in_minutes, 1)
        activity_ratio = (
            record.minutes_active_on_delivery_platform_during_disruption
            / disruption_duration
        )
        feature_vector = [
            record.number_of_claims_filed_in_last_seven_days,
            distance_km,
            activity_ratio,
            record.city_base_risk_score,
            record.rainfall_in_millimetres,
            record.temperature_in_celsius,
            record.air_quality_index,
        ]
        X = np.array([feature_vector])
        prob = _ML_MODEL.predict_proba(X)[0, 1]  # P(fraud=1)
        return round(float(prob), 4)
    except Exception as exc:
        warnings.warn(f"ML prediction failed: {exc}; falling back to rules.")
        return None


# ── Main orchestrator ──────────────────────────────────────────────────────────

def run_anomaly_detection_checks_for_claim(
    claim_activity_record: ClaimActivityRecord,
) -> AnomalyDetectionReport:
    """
    Orchestrates all anomaly detection checks for a single claim.

    Layers:
      1. Deterministic rule checks (frequency, location, activity).
      2. Advanced fraud checks (GPS spoofing, weather mismatch).
      3. GradientBoosting ML scorer (when model is loaded).
      4. Weighted ensemble: 0.70 x ML + 0.30 x rules.
    """
    detection_notes: List[str] = []
    advanced_flags: List[str] = []

    # -- Rule checks ----------------------------------------------------------
    is_frequency_anomalous = is_claim_frequency_higher_than_acceptable_limit(
        claim_activity_record.number_of_claims_filed_in_last_seven_days
    )
    if is_frequency_anomalous:
        detection_notes.append(
            f"Claim frequency anomaly: "
            f"{claim_activity_record.number_of_claims_filed_in_last_seven_days} "
            f"claims in 7 days (limit: {MAXIMUM_ACCEPTABLE_CLAIMS_PER_SEVEN_DAYS})."
        )

    is_location_mismatch, distance_km = is_partner_location_too_far_from_disruption_epicentre(
        claim_activity_record.partner_reported_latitude_at_claim_time,
        claim_activity_record.partner_reported_longitude_at_claim_time,
        claim_activity_record.disruption_epicentre_latitude,
        claim_activity_record.disruption_epicentre_longitude,
    )
    if is_location_mismatch:
        detection_notes.append(
            f"Location mismatch: partner is {distance_km:.2f} km from disruption epicentre "
            f"(limit: {MAXIMUM_ACCEPTABLE_DISTANCE_FROM_DISRUPTION_EPICENTRE_KM} km)."
        )

    is_activity_mismatch = is_delivery_platform_activity_inconsistent_with_disruption_window(
        claim_activity_record.minutes_active_on_delivery_platform_during_disruption,
        claim_activity_record.disruption_duration_in_minutes,
    )
    if is_activity_mismatch:
        detection_notes.append(
            f"Activity signal mismatch: only "
            f"{claim_activity_record.minutes_active_on_delivery_platform_during_disruption} min "
            f"active out of {claim_activity_record.disruption_duration_in_minutes} min disruption window."
        )

    rule_score = compute_rule_based_risk_score(
        is_frequency_anomalous, is_location_mismatch, is_activity_mismatch
    )

    # -- Advanced fraud checks ------------------------------------------------
    is_gps_spoofed, gps_velocity = check_gps_velocity_spoofing(claim_activity_record)
    if is_gps_spoofed and gps_velocity is not None:
        advanced_flags.append(
            f"GPS_VELOCITY_SPOOF: {gps_velocity:.0f} km/h impossible travel speed "
            f"between consecutive claims (threshold: {_GPS_VELOCITY_THRESHOLD_KM_PER_HOUR} km/h)."
        )
        detection_notes.append(advanced_flags[-1])
        # Boost rule score for a confirmed velocity spoof
        rule_score = min(rule_score + 0.35, 1.0)

    is_weather_mismatch, weather_mismatch_pct = check_weather_conditions_mismatch(
        claim_activity_record
    )
    if is_weather_mismatch:
        advanced_flags.append(
            f"WEATHER_CONDITIONS_MISMATCH: partner-reported rainfall is "
            f"{weather_mismatch_pct:.0f}% below the official event measurement."
        )
        detection_notes.append(advanced_flags[-1])
        rule_score = min(rule_score + 0.25, 1.0)

    # -- ML scoring -----------------------------------------------------------
    ml_prob = _predict_ml_fraud_probability(claim_activity_record, distance_km)

    if ml_prob is not None:
        overall_score = round(_ML_WEIGHT * ml_prob + _RULE_WEIGHT * rule_score, 4)
        detection_method = "ml_ensemble"
        if ml_prob >= 0.6:
            detection_notes.append(
                f"ML fraud classifier score: {ml_prob:.3f} "
                f"(GradientBoostingClassifier, threshold 0.60)."
            )
    else:
        overall_score = rule_score
        detection_method = "rule_based"

    # Advanced flags always push score above review threshold
    if advanced_flags:
        overall_score = max(overall_score, ANOMALY_RISK_SCORE_THRESHOLD_FOR_MANUAL_REVIEW + 0.01)

    should_flag = overall_score >= ANOMALY_RISK_SCORE_THRESHOLD_FOR_MANUAL_REVIEW

    return AnomalyDetectionReport(
        claim_id=claim_activity_record.claim_id,
        is_claim_frequency_anomalous=is_frequency_anomalous,
        is_location_mismatch_detected=is_location_mismatch,
        is_activity_signal_mismatch_detected=is_activity_mismatch,
        rule_based_risk_score=rule_score,
        ml_fraud_probability=ml_prob,
        overall_anomaly_risk_score=overall_score,
        should_flag_for_manual_review=should_flag,
        detection_method=detection_method,
        anomaly_detection_notes=detection_notes,
        advanced_fraud_flags=advanced_flags,
        gps_velocity_km_per_hour=gps_velocity,
        weather_mismatch_percentage=weather_mismatch_pct,
    )
