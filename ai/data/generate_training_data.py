"""
generate_training_data.py
─────────────────────────
Generates synthetic insurance claim records for training the RakshaRide
fraud detection ML model.

Distributions are calibrated to mimic realistic patterns:
  • Legitimate claims  (~70 %): low frequency, close to epicentre,
                                reasonable platform activity
  • Fraudulent claims  (~30 %): high frequency, far from epicentre,
                                very low platform activity

Run once to produce claims_training_data.csv.
"""

import random
import csv
import os

random.seed(42)


OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "claims_training_data.csv")
N_SAMPLES = 1000
FRAUD_RATIO = 0.30  # 30 % fraud base rate


FIELD_NAMES = [
    "claims_last_7_days",
    "distance_from_epicentre_km",
    "activity_ratio",
    "city_base_risk_score",
    "rainfall_mm",
    "temperature_c",
    "aqi",
    "is_fraud",  # target label: 0 = legitimate, 1 = fraudulent
]

# City risk scores (low → high risk)
CITY_RISK_SCORES = [0.10, 0.18, 0.23, 0.35, 0.42, 0.50, 0.58, 0.65]


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def generate_legitimate_claim() -> dict:
    """
    Simulates a genuine delivery partner affected by a weather disruption.
    Most have low claim frequency and are near the disruption, but some
    edge cases exist (partners in consecutive weather events can have freq=3-4).
    """
    # Most legit claims: 0-2, occasional 3-4 (back-to-back storm weeks)
    claims_freq = random.choices([0, 1, 2, 3, 4], weights=[30, 30, 22, 15, 3])[0]
    # Clearly inside the disruption zone, with some GPS noise
    distance = _clamp(random.gauss(1.5, 1.8), 0.0, 8.0)
    # Actively working during disruption
    activity_ratio = _clamp(random.gauss(0.58, 0.20), 0.08, 1.0)
    city_risk = random.choice(CITY_RISK_SCORES)
    rainfall = _clamp(random.gauss(70, 20), 30, 150)
    temp = _clamp(random.gauss(34, 5), 22, 46)
    aqi = _clamp(random.gauss(175, 65), 50, 400)
    return {
        "claims_last_7_days": claims_freq,
        "distance_from_epicentre_km": round(distance, 3),
        "activity_ratio": round(activity_ratio, 4),
        "city_base_risk_score": city_risk,
        "rainfall_mm": round(rainfall, 1),
        "temperature_c": round(temp, 1),
        "aqi": round(aqi, 0),
        "is_fraud": 0,
    }


def generate_fraudulent_claim() -> dict:
    """
    Simulates a fraudulent claim. Fraud takes different forms:
      A) 'Frequency fraud'  - many claims, wrong place, low activity
      B) 'Location fraud'   - plausible freq, wrong location (GPS spoof)
      C) 'Activity fraud'   - freq ok, near epicentre, but wasn't working
      D) 'Sophisticated'    - low freq (evading detection), distance/activity off

    The overlap with legitimate distributions forces the ML model to
    learn multi-feature patterns rather than a single threshold.
    """
    fraud_type = random.choices(
        ["frequency", "location", "activity", "sophisticated"],
        weights=[35, 25, 20, 20],
    )[0]

    # Baseline (will be overridden per fraud type)
    claims_freq = random.choices([2, 3, 4, 5, 6], weights=[10, 20, 30, 25, 15])[0]
    distance    = _clamp(random.gauss(3.5, 3.0), 0.2, 12.0)
    activity_ratio = _clamp(random.gauss(0.20, 0.18), 0.0, 0.65)

    if fraud_type == "frequency":
        # Obvious pattern: spamming claims
        claims_freq    = random.choices([5, 6, 7, 8], weights=[25, 30, 25, 20])[0]
        distance       = _clamp(random.gauss(12, 8), 2, 50)
        activity_ratio = _clamp(random.gauss(0.05, 0.04), 0.0, 0.12)

    elif fraud_type == "location":
        # GPS spoofing — near-normal frequency, but wrong place
        claims_freq    = random.choices([2, 3, 4, 5], weights=[20, 30, 30, 20])[0]
        distance       = _clamp(random.gauss(20, 10), 6, 60)
        activity_ratio = _clamp(random.gauss(0.30, 0.20), 0.05, 0.70)

    elif fraud_type == "activity":
        # Near epicentre but clearly wasn't working (waiting at home)
        claims_freq    = random.choices([1, 2, 3, 4], weights=[15, 25, 35, 25])[0]
        distance       = _clamp(random.gauss(2.5, 2.0), 0.1, 7.0)
        activity_ratio = _clamp(random.gauss(0.03, 0.025), 0.0, 0.09)

    elif fraud_type == "sophisticated":
        # Low frequency to avoid detection, but location/activity give it away
        claims_freq    = random.choices([1, 2, 3], weights=[35, 40, 25])[0]
        distance       = _clamp(random.gauss(14, 7), 5, 45)
        activity_ratio = _clamp(random.gauss(0.04, 0.03), 0.0, 0.08)

    city_risk = random.choice(CITY_RISK_SCORES)
    rainfall  = _clamp(random.gauss(58, 24), 10, 140)
    temp      = _clamp(random.gauss(33, 5), 20, 46)
    aqi       = _clamp(random.gauss(165, 80), 40, 450)

    return {
        "claims_last_7_days":      claims_freq,
        "distance_from_epicentre_km": round(distance, 3),
        "activity_ratio":          round(activity_ratio, 4),
        "city_base_risk_score":    city_risk,
        "rainfall_mm":             round(rainfall, 1),
        "temperature_c":           round(temp, 1),
        "aqi":                     round(aqi, 0),
        "is_fraud":                1,
    }


def main():
    n_fraud = int(N_SAMPLES * FRAUD_RATIO)
    n_legit = N_SAMPLES - n_fraud

    records = (
        [generate_legitimate_claim() for _ in range(n_legit)]
        + [generate_fraudulent_claim() for _ in range(n_fraud)]
    )

    # Shuffle so rows aren't ordered legit → fraud
    random.shuffle(records)

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELD_NAMES)
        writer.writeheader()
        writer.writerows(records)

    print(f"[OK] Generated {len(records)} records -> {OUTPUT_CSV}")
    print(f"    Legitimate : {n_legit}  ({n_legit/N_SAMPLES*100:.0f} %)")
    print(f"    Fraudulent : {n_fraud}  ({n_fraud/N_SAMPLES*100:.0f} %)")


if __name__ == "__main__":
    main()
