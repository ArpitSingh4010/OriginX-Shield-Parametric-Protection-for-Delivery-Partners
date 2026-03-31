"""
Risk assessment module for the GigShield parametric insurance platform.

Calculates a location-based risk score for each delivery zone by analysing:
  - Historical frequency of weather disruptions in the area
  - Average severity of past disruption events
  - Seasonal adjustment factors

The resulting risk score is used to determine the location risk category
(low / moderate / high / very_high), which in turn influences the weekly
premium multiplier applied to each delivery partner's policy.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List


class LocationRiskCategory(str, Enum):
    """Enumeration of risk categories assigned to delivery zones."""

    LOW_RISK_ZONE = "low_risk_zone"
    MODERATE_RISK_ZONE = "moderate_risk_zone"
    HIGH_RISK_ZONE = "high_risk_zone"
    VERY_HIGH_RISK_ZONE = "very_high_risk_zone"


@dataclass
class HistoricalDisruptionRecord:
    """
    Represents a single historical disruption event used as training data
    for the risk assessment model.
    """

    disruption_type: str
    rainfall_in_millimetres: float = 0.0
    temperature_in_celsius: float = 0.0
    air_quality_index: float = 0.0
    duration_in_hours: float = 0.0
    estimated_income_loss_percentage: float = 0.0


@dataclass
class DeliveryZoneRiskProfile:
    """
    Encapsulates the risk assessment output for a specific delivery zone.
    """

    zone_city_name: str
    zone_centre_latitude: float
    zone_centre_longitude: float
    computed_risk_score: float
    assigned_risk_category: LocationRiskCategory
    historical_disruption_records: List[HistoricalDisruptionRecord] = field(
        default_factory=list
    )


# Thresholds that determine which risk category a score falls into.
RISK_SCORE_THRESHOLD_FOR_LOW_CATEGORY = 0.25
RISK_SCORE_THRESHOLD_FOR_MODERATE_CATEGORY = 0.50
RISK_SCORE_THRESHOLD_FOR_HIGH_CATEGORY = 0.75


def calculate_average_disruption_frequency_per_week(
    historical_disruption_records: List[HistoricalDisruptionRecord],
    observation_period_in_weeks: int,
) -> float:
    """
    Calculates how many disruption events occur on average per week
    in a delivery zone over the observed historical period.

    Args:
        historical_disruption_records: All recorded disruptions for the zone.
        observation_period_in_weeks: The number of weeks of history available.

    Returns:
        Average number of disruption events per week (float).
    """
    if observation_period_in_weeks <= 0:
        return 0.0

    total_disruption_count = len(historical_disruption_records)
    return total_disruption_count / observation_period_in_weeks


def calculate_average_estimated_income_loss_percentage(
    historical_disruption_records: List[HistoricalDisruptionRecord],
) -> float:
    """
    Computes the mean income loss percentage across all historical
    disruption events for a delivery zone.

    Args:
        historical_disruption_records: All recorded disruptions for the zone.

    Returns:
        Mean income loss percentage (0–100), or 0.0 if no records exist.
    """
    if not historical_disruption_records:
        return 0.0

    total_income_loss_percentage = sum(
        record.estimated_income_loss_percentage
        for record in historical_disruption_records
    )
    return total_income_loss_percentage / len(historical_disruption_records)


def normalise_value_to_zero_one_range(
    raw_value: float, minimum_expected_value: float, maximum_expected_value: float
) -> float:
    """
    Scales a raw measurement into the [0, 1] range using min-max normalisation.

    Args:
        raw_value: The value to normalise.
        minimum_expected_value: The lower bound of the expected range.
        maximum_expected_value: The upper bound of the expected range.

    Returns:
        Normalised value clamped to [0, 1].
    """
    if maximum_expected_value <= minimum_expected_value:
        return 0.0

    normalised = (raw_value - minimum_expected_value) / (
        maximum_expected_value - minimum_expected_value
    )
    return max(0.0, min(1.0, normalised))


def compute_location_risk_score(
    average_weekly_disruption_frequency: float,
    average_income_loss_percentage: float,
    frequency_weight: float = 0.6,
    severity_weight: float = 0.4,
) -> float:
    """
    Combines the disruption frequency and average income loss severity
    into a single normalised risk score in [0, 1].

    The default weighting gives more importance to how often disruptions
    occur (60 %) than to how severe they are on average (40 %).

    Args:
        average_weekly_disruption_frequency: Mean number of disruptions
            per week.
        average_income_loss_percentage: Mean income loss per disruption (0–100).
        frequency_weight: Weight for the frequency component.
        severity_weight: Weight for the severity component.

    Returns:
        Composite risk score in [0, 1].
    """
    MAX_EXPECTED_WEEKLY_DISRUPTIONS = 5.0
    MAX_EXPECTED_INCOME_LOSS_PERCENTAGE = 100.0

    normalised_frequency_score = normalise_value_to_zero_one_range(
        average_weekly_disruption_frequency,
        minimum_expected_value=0.0,
        maximum_expected_value=MAX_EXPECTED_WEEKLY_DISRUPTIONS,
    )
    normalised_severity_score = normalise_value_to_zero_one_range(
        average_income_loss_percentage,
        minimum_expected_value=0.0,
        maximum_expected_value=MAX_EXPECTED_INCOME_LOSS_PERCENTAGE,
    )

    composite_risk_score = (
        frequency_weight * normalised_frequency_score
        + severity_weight * normalised_severity_score
    )
    return round(composite_risk_score, 4)


def classify_risk_score_into_location_category(
    computed_risk_score: float,
) -> LocationRiskCategory:
    """
    Maps a numeric risk score to the corresponding LocationRiskCategory
    enum value based on predefined band thresholds.

    Args:
        computed_risk_score: Value in [0, 1] from compute_location_risk_score.

    Returns:
        The appropriate LocationRiskCategory for the score.
    """
    if computed_risk_score <= RISK_SCORE_THRESHOLD_FOR_LOW_CATEGORY:
        return LocationRiskCategory.LOW_RISK_ZONE
    elif computed_risk_score <= RISK_SCORE_THRESHOLD_FOR_MODERATE_CATEGORY:
        return LocationRiskCategory.MODERATE_RISK_ZONE
    elif computed_risk_score <= RISK_SCORE_THRESHOLD_FOR_HIGH_CATEGORY:
        return LocationRiskCategory.HIGH_RISK_ZONE
    else:
        return LocationRiskCategory.VERY_HIGH_RISK_ZONE


def assess_delivery_zone_risk_profile(
    zone_city_name: str,
    zone_centre_latitude: float,
    zone_centre_longitude: float,
    historical_disruption_records: List[HistoricalDisruptionRecord],
    observation_period_in_weeks: int = 52,
) -> DeliveryZoneRiskProfile:
    """
    Performs a complete risk assessment for a delivery zone and returns
    a DeliveryZoneRiskProfile containing the score and category.

    Args:
        zone_city_name: Human-readable name of the city/zone.
        zone_centre_latitude: Latitude of the zone centre.
        zone_centre_longitude: Longitude of the zone centre.
        historical_disruption_records: Past disruption events for this zone.
        observation_period_in_weeks: Weeks of historical data available.

    Returns:
        A populated DeliveryZoneRiskProfile dataclass instance.
    """
    average_weekly_disruption_frequency = (
        calculate_average_disruption_frequency_per_week(
            historical_disruption_records, observation_period_in_weeks
        )
    )
    average_income_loss_percentage = calculate_average_estimated_income_loss_percentage(
        historical_disruption_records
    )

    computed_risk_score = compute_location_risk_score(
        average_weekly_disruption_frequency, average_income_loss_percentage
    )
    assigned_risk_category = classify_risk_score_into_location_category(
        computed_risk_score
    )

    return DeliveryZoneRiskProfile(
        zone_city_name=zone_city_name,
        zone_centre_latitude=zone_centre_latitude,
        zone_centre_longitude=zone_centre_longitude,
        computed_risk_score=computed_risk_score,
        assigned_risk_category=assigned_risk_category,
        historical_disruption_records=historical_disruption_records,
    )
