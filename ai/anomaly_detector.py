"""
Anomaly detection module for the GigShield fraud prevention system.

Analyses claim submissions to identify patterns that deviate significantly
from established norms, flagging potentially fraudulent activity before
a payout is approved.

Detection checks performed:
  1. Claim frequency spike: delivery partner submitting too many claims in a
     short period compared to the population average.
  2. Location–disruption mismatch: the partner's reported location at claim
     time is far from the epicentre of the recorded disruption event.
  3. Activity signal mismatch: delivery platform activity is inconsistent
     with the disruption window reported in the claim.
"""

from dataclasses import dataclass, field
from typing import List, Optional


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


@dataclass
class AnomalyDetectionReport:
    """
    Contains the outcome of all anomaly detection checks for a single claim.
    """

    claim_id: str
    is_claim_frequency_anomalous: bool
    is_location_mismatch_detected: bool
    is_activity_signal_mismatch_detected: bool
    overall_anomaly_risk_score: float
    should_flag_for_manual_review: bool
    anomaly_detection_notes: List[str] = field(default_factory=list)


# Thresholds used to decide whether a check has found an anomaly.
MAXIMUM_ACCEPTABLE_CLAIMS_PER_SEVEN_DAYS = 3
MAXIMUM_ACCEPTABLE_DISTANCE_FROM_DISRUPTION_EPICENTRE_KM = 5.0
MINIMUM_ACCEPTABLE_ACTIVITY_RATIO_DURING_DISRUPTION = 0.10
ANOMALY_RISK_SCORE_THRESHOLD_FOR_MANUAL_REVIEW = 0.40


def calculate_straight_line_distance_in_kilometres(
    latitude_point_a: float,
    longitude_point_a: float,
    latitude_point_b: float,
    longitude_point_b: float,
) -> float:
    """
    Computes the great-circle distance between two geographic coordinates
    using the Haversine formula.

    Args:
        latitude_point_a:  Latitude of the first point (degrees).
        longitude_point_a: Longitude of the first point (degrees).
        latitude_point_b:  Latitude of the second point (degrees).
        longitude_point_b: Longitude of the second point (degrees).

    Returns:
        Distance in kilometres (float).
    """
    import math

    EARTH_RADIUS_KILOMETRES = 6371.0

    latitude_difference_radians = math.radians(latitude_point_b - latitude_point_a)
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


def is_claim_frequency_higher_than_acceptable_limit(
    number_of_claims_filed_in_last_seven_days: int,
) -> bool:
    """
    Checks whether the delivery partner has filed more claims in the
    last 7 days than the maximum allowed limit.

    Args:
        number_of_claims_filed_in_last_seven_days: Count of recent claims.

    Returns:
        True if the claim count exceeds the acceptable limit.
    """
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
    """
    Checks whether the delivery partner's reported location at claim time
    is within the acceptable radius of the disruption event's epicentre.

    Args:
        partner_reported_latitude:  Latitude reported by the partner.
        partner_reported_longitude: Longitude reported by the partner.
        disruption_epicentre_latitude:  Latitude of the disruption centre.
        disruption_epicentre_longitude: Longitude of the disruption centre.

    Returns:
        A tuple (is_mismatch_detected, distance_in_km) where
        is_mismatch_detected is True if the partner is too far away.
    """
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
    """
    Checks whether the delivery partner's recorded platform activity
    during the disruption window is below the minimum expected ratio.

    A partner claiming compensation should have been meaningfully active
    (i.e. attempting deliveries) during at least 10 % of the disruption period.

    Args:
        minutes_active_on_platform: Minutes of recorded delivery activity.
        disruption_duration_in_minutes: Total duration of the disruption.

    Returns:
        True if the activity level is suspiciously low.
    """
    if disruption_duration_in_minutes <= 0:
        return True

    activity_ratio = minutes_active_on_platform / disruption_duration_in_minutes
    return activity_ratio < MINIMUM_ACCEPTABLE_ACTIVITY_RATIO_DURING_DISRUPTION


def compute_overall_anomaly_risk_score(
    is_claim_frequency_anomalous: bool,
    is_location_mismatch_detected: bool,
    is_activity_signal_mismatch_detected: bool,
) -> float:
    """
    Calculates a composite anomaly risk score by summing the weighted
    contributions of each individual anomaly check.

    Weights:
      - High claim frequency:       0.35
      - Location mismatch:          0.40
      - Activity signal mismatch:   0.25

    Args:
        is_claim_frequency_anomalous:       Result of frequency check.
        is_location_mismatch_detected:      Result of location check.
        is_activity_signal_mismatch_detected: Result of activity check.

    Returns:
        Composite anomaly risk score in [0, 1].
    """
    accumulated_risk_score = 0.0

    if is_claim_frequency_anomalous:
        accumulated_risk_score += 0.35

    if is_location_mismatch_detected:
        accumulated_risk_score += 0.40

    if is_activity_signal_mismatch_detected:
        accumulated_risk_score += 0.25

    return min(accumulated_risk_score, 1.0)


def run_anomaly_detection_checks_for_claim(
    claim_activity_record: ClaimActivityRecord,
) -> AnomalyDetectionReport:
    """
    Orchestrates all anomaly detection checks for a single claim and
    returns a comprehensive AnomalyDetectionReport.

    Args:
        claim_activity_record: All data required to evaluate the claim.

    Returns:
        AnomalyDetectionReport with results from all checks.
    """
    detection_notes: List[str] = []

    is_frequency_anomalous = is_claim_frequency_higher_than_acceptable_limit(
        claim_activity_record.number_of_claims_filed_in_last_seven_days
    )
    if is_frequency_anomalous:
        detection_notes.append(
            f"Claim frequency anomaly: {claim_activity_record.number_of_claims_filed_in_last_seven_days} "
            f"claims in the last 7 days (limit: {MAXIMUM_ACCEPTABLE_CLAIMS_PER_SEVEN_DAYS})."
        )

    is_location_mismatch, distance_from_epicentre_km = (
        is_partner_location_too_far_from_disruption_epicentre(
            claim_activity_record.partner_reported_latitude_at_claim_time,
            claim_activity_record.partner_reported_longitude_at_claim_time,
            claim_activity_record.disruption_epicentre_latitude,
            claim_activity_record.disruption_epicentre_longitude,
        )
    )
    if is_location_mismatch:
        detection_notes.append(
            f"Location mismatch: partner is {distance_from_epicentre_km:.2f} km from the "
            f"disruption epicentre (limit: {MAXIMUM_ACCEPTABLE_DISTANCE_FROM_DISRUPTION_EPICENTRE_KM} km)."
        )

    is_activity_mismatch = (
        is_delivery_platform_activity_inconsistent_with_disruption_window(
            claim_activity_record.minutes_active_on_delivery_platform_during_disruption,
            claim_activity_record.disruption_duration_in_minutes,
        )
    )
    if is_activity_mismatch:
        detection_notes.append(
            f"Activity signal mismatch: only "
            f"{claim_activity_record.minutes_active_on_delivery_platform_during_disruption} min "
            f"active out of {claim_activity_record.disruption_duration_in_minutes} min disruption window."
        )

    overall_anomaly_risk_score = compute_overall_anomaly_risk_score(
        is_frequency_anomalous, is_location_mismatch, is_activity_mismatch
    )

    should_flag_for_manual_review = (
        overall_anomaly_risk_score >= ANOMALY_RISK_SCORE_THRESHOLD_FOR_MANUAL_REVIEW
    )

    return AnomalyDetectionReport(
        claim_id=claim_activity_record.claim_id,
        is_claim_frequency_anomalous=is_frequency_anomalous,
        is_location_mismatch_detected=is_location_mismatch,
        is_activity_signal_mismatch_detected=is_activity_mismatch,
        overall_anomaly_risk_score=overall_anomaly_risk_score,
        should_flag_for_manual_review=should_flag_for_manual_review,
        anomaly_detection_notes=detection_notes,
    )
