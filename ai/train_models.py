"""
train_models.py
---------------
Trains the RakshaRide ML models and saves them to ai/models/.

Models produced:
  1. fraud_classifier.pkl      - GradientBoostingClassifier
     Predicts P(fraud) for a claim submission.

  2. risk_regressor.pkl        - RandomForestRegressor
     Predicts a location risk score in [0, 1].

Run once before starting the AI server:
    py train_models.py

Re-run at any time to retrain on fresh data; the /retrain endpoint
does this automatically via subprocess.
"""

import json
import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestRegressor
from sklearn.metrics import classification_report, mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from datetime import datetime, timezone

# -- Paths --

BASE_DIR = os.path.dirname(__file__)
DATA_FILE = os.path.join(BASE_DIR, "data", "claims_training_data.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")
FRAUD_MODEL_PATH = os.path.join(MODELS_DIR, "fraud_classifier.pkl")
RISK_MODEL_PATH = os.path.join(MODELS_DIR, "risk_regressor.pkl")
METADATA_PATH = os.path.join(MODELS_DIR, "model_metadata.json")

os.makedirs(MODELS_DIR, exist_ok=True)

# -- Feature definitions --

FRAUD_FEATURES = [
    "claims_last_7_days",
    "distance_from_epicentre_km",
    "activity_ratio",
    "city_base_risk_score",
    "rainfall_mm",
    "temperature_c",
    "aqi",
]
FRAUD_TARGET = "is_fraud"

RISK_FEATURES = [
    "claims_last_7_days",       # proxy for disruption frequency
    "city_base_risk_score",
    "rainfall_mm",
    "temperature_c",
    "aqi",
]
# Derive a pseudo risk_score target from the data for the regressor
# Formula: weighted combination of observable signals (same as current rule engine)


def derive_risk_score(df: pd.DataFrame) -> pd.Series:
    """
    Creates a continuous risk score target from the raw data columns
    so the RandomForestRegressor has a meaningful float target to learn from.
    """
    freq_norm = (df["claims_last_7_days"] / 7.0).clip(0, 1)
    rain_norm = (df["rainfall_mm"] / 150.0).clip(0, 1)
    temp_norm = ((df["temperature_c"] - 20) / 25.0).clip(0, 1)
    aqi_norm  = (df["aqi"] / 500.0).clip(0, 1)
    city_risk = df["city_base_risk_score"]

    score = (
        0.30 * freq_norm
        + 0.20 * rain_norm
        + 0.20 * temp_norm
        + 0.15 * aqi_norm
        + 0.15 * city_risk
    )
    return score.clip(0.0, 1.0).round(4)


# -- Training helpers -----------------------------------------------------------

def train_fraud_classifier(df: pd.DataFrame) -> dict:
    print("\n-- Training Fraud Classifier (GradientBoostingClassifier) --")

    X = df[FRAUD_FEATURES]
    y = df[FRAUD_TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    model = GradientBoostingClassifier(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.85,
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    accuracy = (y_pred == y_test).mean()

    print(f"   Test accuracy : {accuracy:.4f}  ({accuracy*100:.1f} %)")
    print("\n" + classification_report(y_test, y_pred, target_names=["Legitimate", "Fraud"]))

    importances = dict(zip(FRAUD_FEATURES, model.feature_importances_.round(4).tolist()))
    print("   Feature importances:")
    for feat, imp in sorted(importances.items(), key=lambda x: -x[1]):
        bar = "#" * int(imp * 40)
        print(f"     {feat:<35} {imp:.4f}  {bar}")

    joblib.dump(model, FRAUD_MODEL_PATH)
    print(f"\n   [OK] Saved -> {FRAUD_MODEL_PATH}")

    return {
        "accuracy": round(float(accuracy), 4),
        "test_samples": len(y_test),
        "feature_importances": importances,
    }


def train_risk_regressor(df: pd.DataFrame) -> dict:
    print("\n-- Training Risk Regressor (RandomForestRegressor) --")

    df = df.copy()
    df["risk_score"] = derive_risk_score(df)

    X = df[RISK_FEATURES]
    y = df["risk_score"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=100,
        max_depth=6,
        min_samples_leaf=3,
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2  = r2_score(y_test, y_pred)

    print(f"   MAE      : {mae:.4f}")
    print(f"   R2       : {r2:.4f}")

    importances = dict(zip(RISK_FEATURES, model.feature_importances_.round(4).tolist()))
    print("   Feature importances:")
    for feat, imp in sorted(importances.items(), key=lambda x: -x[1]):
        bar = "#" * int(imp * 40)
        print(f"     {feat:<35} {imp:.4f}  {bar}")

    joblib.dump(model, RISK_MODEL_PATH)
    print(f"\n   [OK] Saved -> {RISK_MODEL_PATH}")

    return {
        "mae": round(float(mae), 4),
        "r2": round(float(r2), 4),
        "test_samples": len(y_test),
        "feature_importances": importances,
    }


# -- Metadata persistence ----

def save_metadata(fraud_metrics: dict, risk_metrics: dict, n_samples: int):
    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_samples": n_samples,
        "fraud_classifier": {
            "model_type": "GradientBoostingClassifier",
            "sklearn_params": {
                "n_estimators": 150,
                "max_depth": 4,
                "learning_rate": 0.08,
                "subsample": 0.85,
            },
            "features": FRAUD_FEATURES,
            "metrics": fraud_metrics,
        },
        "risk_regressor": {
            "model_type": "RandomForestRegressor",
            "sklearn_params": {
                "n_estimators": 100,
                "max_depth": 6,
                "min_samples_leaf": 3,
            },
            "features": RISK_FEATURES,
            "metrics": risk_metrics,
        },
        "data_note": (
            "Models trained on synthetically generated data "
            "calibrated to realistic Indian gig-worker insurance patterns. "
            "Suitable for demonstration/hackathon use; "
            "production deployment requires real historical claim data."
        ),
    }

    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n   [OK] Metadata  -> {METADATA_PATH}")


# -- Entry point -----

def main():
    print("RakshaRide ML Training Pipeline")
    print("=" * 50)

    # Generate data if CSV doesn't exist yet
    if not os.path.exists(DATA_FILE):
        print(f"Training data not found at {DATA_FILE}")
        print("Running data generator...")
        import subprocess
        result = subprocess.run(
            [sys.executable, os.path.join(BASE_DIR, "data", "generate_training_data.py")],
            capture_output=True, text=True,
        )
        print(result.stdout)
        if result.returncode != 0:
            print("ERROR:", result.stderr)
            sys.exit(1)

    df = pd.read_csv(DATA_FILE)
    print(f"\nLoaded {len(df)} training samples from {DATA_FILE}")
    print(f"  Legitimate : {(df['is_fraud'] == 0).sum()}")
    print(f"  Fraudulent : {(df['is_fraud'] == 1).sum()}")

    fraud_metrics = train_fraud_classifier(df)
    risk_metrics  = train_risk_regressor(df)
    save_metadata(fraud_metrics, risk_metrics, len(df))

    print("\n" + "=" * 50)
    print("[DONE] Training complete. Start the AI server with:")
    print("      py app.py")


if __name__ == "__main__":
    main()
