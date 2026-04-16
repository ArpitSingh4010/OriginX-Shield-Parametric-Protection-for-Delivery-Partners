"""
RakshaRide AI Server - Flask REST API  (ML-enhanced)

Exposes the ML-powered risk assessment and anomaly detection modules as
HTTP endpoints for the Node.js backend and React frontend.

ML stack:
  • GradientBoostingClassifier  — fraud detection   (anomaly_detector.py)
  • RandomForestRegressor       — location risk      (risk_assessment.py)
  • Graceful rule-based fallback when .pkl files are unavailable

Runs on port 5001 by default.

Start with:
    py train_models.py      (first time only — builds .pkl files)
    py app.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys, os, traceback, json, subprocess
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

sys.path.insert(0, os.path.dirname(__file__))

from risk_assessment import (
    HistoricalDisruptionRecord,
    assess_delivery_zone_risk_profile,
    LocationRiskCategory,
)
from anomaly_detector import (
    ClaimActivityRecord,
    run_anomaly_detection_checks_for_claim,
)

app = Flask(__name__)
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
CORS(app, origins=[FRONTEND_URL])

AI_SERVICE_PORT          = int(os.environ.get('AI_SERVICE_PORT', '5001'))
AI_SERVICE_HOST          = os.environ.get('AI_SERVICE_HOST', '0.0.0.0')
AI_SERVICE_DEBUG         = os.environ.get('AI_SERVICE_DEBUG', 'true').lower() == 'true'
AI_SERVICE_PUBLIC_BASE_URL = os.environ.get(
    'AI_SERVICE_PUBLIC_BASE_URL', f'http://localhost:{AI_SERVICE_PORT}'
)

MODELS_DIR    = os.path.join(os.path.dirname(__file__), 'models')
METADATA_PATH = os.path.join(MODELS_DIR, 'model_metadata.json')


def _load_model_metadata() -> dict:
    """Returns model_metadata.json contents, or a sensible default."""
    if os.path.exists(METADATA_PATH):
        try:
            with open(METADATA_PATH, encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {
        'trained_at': None,
        'note': 'Models not yet trained. Run: py train_models.py',
    }


# ── Health ─────────────────────────────────────────────────────────────────────

@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'status': 'ok',
        'service': 'RakshaRide AI Server',
        'message': 'AI service is running. Use /health or /model-info for status.',
    })


@app.route('/health', methods=['GET'])
def health():
    meta = _load_model_metadata()
    return jsonify({
        'status': 'healthy',
        'service': 'RakshaRide AI Server',
        'port': AI_SERVICE_PORT,
        'modelsTrainedAt': meta.get('trained_at'),
    })


# ── GET /model-info ────────────────────────────────────────────────────────────

@app.route('/model-info', methods=['GET'])
def model_info():
    """
    Returns training metadata for both ML models including accuracy metrics
    and feature importances.
    """
    meta = _load_model_metadata()
    return jsonify({'success': True, 'modelMetadata': meta})


# ── POST /assess-risk ──────────────────────────────────────────────────────────

@app.route('/assess-risk', methods=['POST'])
def assess_risk():
    """
    Calculates the location risk score for a delivery zone using the
    RandomForestRegressor (with rule-based fallback).

    Request body (JSON):
    {
        "zoneCityName": "Chennai",
        "zoneCentreLatitude": 13.0827,
        "zoneCentreLongitude": 80.2707,
        "cityBaseRiskScore": 0.42,          // optional
        "observationPeriodInWeeks": 52,     // optional
        "historicalDisruptionRecords": [
            {
                "disruptionType": "heavy_rainfall",
                "rainfallInMillimetres": 75.0,
                "temperatureInCelsius": 31.0,
                "airQualityIndex": 110.0,
                "durationInHours": 6.0,
                "estimatedIncomeLossPercentage": 30.0
            }
        ]
    }

    Response additionally includes:
        "detectionMethod": "ml" | "rule_based"
        "mlPredictedRiskScore": float | null
        "ruleBased RiskScore": float
    """
    try:
        body = request.get_json(force=True)

        zone_city_name           = body.get('zoneCityName', 'Unknown')
        zone_centre_latitude     = float(body.get('zoneCentreLatitude', 0.0))
        zone_centre_longitude    = float(body.get('zoneCentreLongitude', 0.0))
        observation_period_weeks = int(body.get('observationPeriodInWeeks', 52))
        city_base_risk_score     = float(body.get('cityBaseRiskScore', 0.30))
        raw_records              = body.get('historicalDisruptionRecords', [])

        historical_records = [
            HistoricalDisruptionRecord(
                disruption_type=rec.get('disruptionType', 'unknown'),
                rainfall_in_millimetres=float(rec.get('rainfallInMillimetres', 0.0)),
                temperature_in_celsius=float(rec.get('temperatureInCelsius', 0.0)),
                air_quality_index=float(rec.get('airQualityIndex', 0.0)),
                duration_in_hours=float(rec.get('durationInHours', 0.0)),
                estimated_income_loss_percentage=float(rec.get('estimatedIncomeLossPercentage', 0.0)),
            )
            for rec in raw_records
        ]

        risk_profile = assess_delivery_zone_risk_profile(
            zone_city_name=zone_city_name,
            zone_centre_latitude=zone_centre_latitude,
            zone_centre_longitude=zone_centre_longitude,
            historical_disruption_records=historical_records,
            observation_period_in_weeks=observation_period_weeks,
            city_base_risk_score=city_base_risk_score,
        )

        return jsonify({
            'success': True,
            'zoneCityName': risk_profile.zone_city_name,
            'computedRiskScore': risk_profile.computed_risk_score,
            'ruleBasedRiskScore': risk_profile.rule_based_risk_score,
            'mlPredictedRiskScore': risk_profile.ml_predicted_risk_score,
            'assignedRiskCategory': risk_profile.assigned_risk_category.value,
            'detectionMethod': risk_profile.detection_method,
            'observationPeriodInWeeks': observation_period_weeks,
            'totalHistoricalDisruptionRecords': len(historical_records),
        })

    except Exception as exc:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(exc)}), 500


# ── POST /detect-anomaly ───────────────────────────────────────────────────────

@app.route('/detect-anomaly', methods=['POST'])
def detect_anomaly():
    """
    Runs the ML fraud detection pipeline on a single insurance claim.

    New fields vs original:
      "mlFraudProbability"  : float | null   — GradientBoosting P(fraud)
      "ruleBasedRiskScore"  : float           — deterministic rule score
      "detectionMethod"     : "ml_ensemble" | "rule_based"

    Optional new request fields:
      "cityBaseRiskScore"       : float  (default 0.30)
      "rainfallInMillimetres"   : float  (default 60.0)
      "temperatureInCelsius"    : float  (default 33.0)
      "airQualityIndex"         : float  (default 180.0)
    """
    try:
        body = request.get_json(force=True)

        claim_record = ClaimActivityRecord(
            claim_id=body.get('claimId', 'unknown'),
            delivery_partner_id=body.get('deliveryPartnerId', 'unknown'),
            number_of_claims_filed_in_last_seven_days=int(
                body.get('numberOfClaimsFiledInLastSevenDays', 0)
            ),
            partner_reported_latitude_at_claim_time=float(
                body.get('partnerReportedLatitudeAtClaimTime', 0.0)
            ),
            partner_reported_longitude_at_claim_time=float(
                body.get('partnerReportedLongitudeAtClaimTime', 0.0)
            ),
            disruption_epicentre_latitude=float(body.get('disruptionEpicentreLatitude', 0.0)),
            disruption_epicentre_longitude=float(body.get('disruptionEpicentreLongitude', 0.0)),
            minutes_active_on_delivery_platform_during_disruption=int(
                body.get('minutesActiveOnDeliveryPlatformDuringDisruption', 0)
            ),
            disruption_duration_in_minutes=int(body.get('disruptionDurationInMinutes', 60)),
            # ML-enhanced fields
            city_base_risk_score=float(body.get('cityBaseRiskScore', 0.30)),
            rainfall_in_millimetres=float(body.get('rainfallInMillimetres', 60.0)),
            temperature_in_celsius=float(body.get('temperatureInCelsius', 33.0)),
            air_quality_index=float(body.get('airQualityIndex', 180.0)),
            # Advanced fraud detection fields
            previous_claim_latitude=float(body['previousClaimLatitude']) if body.get('previousClaimLatitude') is not None else None,
            previous_claim_longitude=float(body['previousClaimLongitude']) if body.get('previousClaimLongitude') is not None else None,
            hours_since_previous_claim=float(body['hoursSincePreviousClaim']) if body.get('hoursSincePreviousClaim') is not None else None,
            event_measured_rainfall_mm=float(body['eventMeasuredRainfallMm']) if body.get('eventMeasuredRainfallMm') is not None else None,
            event_measured_temperature_c=float(body['eventMeasuredTemperatureC']) if body.get('eventMeasuredTemperatureC') is not None else None,
            event_measured_aqi=float(body['eventMeasuredAqi']) if body.get('eventMeasuredAqi') is not None else None,
        )

        report = run_anomaly_detection_checks_for_claim(claim_record)

        return jsonify({
            'success': True,
            'claimId': report.claim_id,
            'isClaimFrequencyAnomalous': report.is_claim_frequency_anomalous,
            'isLocationMismatchDetected': report.is_location_mismatch_detected,
            'isActivitySignalMismatchDetected': report.is_activity_signal_mismatch_detected,
            'ruleBasedRiskScore': report.rule_based_risk_score,
            'mlFraudProbability': report.ml_fraud_probability,
            'overallAnomalyRiskScore': report.overall_anomaly_risk_score,
            'shouldFlagForManualReview': report.should_flag_for_manual_review,
            'detectionMethod': report.detection_method,
            'anomalyDetectionNotes': report.anomaly_detection_notes,
            # Advanced fraud detection
            'advancedFraudFlags': report.advanced_fraud_flags,
            'gpsVelocityKmPerHour': report.gps_velocity_km_per_hour,
            'weatherMismatchPercentage': report.weather_mismatch_percentage,
        })

    except Exception as exc:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(exc)}), 500


# ── POST /quick-risk-assess ────────────────────────────────────────────────────

@app.route('/quick-risk-assess', methods=['POST'])
def quick_risk_assess():
    """
    Simplified risk assessment for the frontend registration flow.
    Request body: { "cityName": "Chennai" }
    """
    CITY_PRESETS = {
        'chennai':   {'lat': 13.0827, 'lon': 80.2707, 'records': 18, 'avg_loss': 28.0, 'weeks': 52, 'city_risk': 0.50},
        'mumbai':    {'lat': 19.0760, 'lon': 72.8777, 'records': 20, 'avg_loss': 32.0, 'weeks': 52, 'city_risk': 0.58},
        'delhi':     {'lat': 28.6139, 'lon': 77.2090, 'records': 22, 'avg_loss': 35.0, 'weeks': 52, 'city_risk': 0.65},
        'bengaluru': {'lat': 12.9716, 'lon': 77.5946, 'records': 14, 'avg_loss': 20.0, 'weeks': 52, 'city_risk': 0.35},
        'hyderabad': {'lat': 17.3850, 'lon': 78.4867, 'records': 12, 'avg_loss': 18.0, 'weeks': 52, 'city_risk': 0.30},
        'kolkata':   {'lat': 22.5726, 'lon': 88.3639, 'records': 16, 'avg_loss': 25.0, 'weeks': 52, 'city_risk': 0.42},
        'pune':      {'lat': 18.5204, 'lon': 73.8567, 'records': 10, 'avg_loss': 15.0, 'weeks': 52, 'city_risk': 0.23},
        'ahmedabad': {'lat': 23.0225, 'lon': 72.5714, 'records':  8, 'avg_loss': 12.0, 'weeks': 52, 'city_risk': 0.18},
    }

    try:
        body      = request.get_json(force=True)
        city_name = body.get('cityName', '').strip().lower()
        preset    = CITY_PRESETS.get(city_name, {
            'lat': 0, 'lon': 0, 'records': 5, 'avg_loss': 15.0, 'weeks': 52, 'city_risk': 0.30
        })

        synthetic_records = [
            HistoricalDisruptionRecord(
                disruption_type='heavy_rainfall',
                rainfall_in_millimetres=65.0,
                temperature_in_celsius=32.0,
                air_quality_index=120.0,
                duration_in_hours=4.0,
                estimated_income_loss_percentage=preset['avg_loss'],
            )
            for _ in range(preset['records'])
        ]

        risk_profile = assess_delivery_zone_risk_profile(
            zone_city_name=body.get('cityName', city_name),
            zone_centre_latitude=preset['lat'],
            zone_centre_longitude=preset['lon'],
            historical_disruption_records=synthetic_records,
            observation_period_in_weeks=preset['weeks'],
            city_base_risk_score=preset['city_risk'],
        )

        return jsonify({
            'success': True,
            'cityName': body.get('cityName', city_name),
            'computedRiskScore': risk_profile.computed_risk_score,
            'ruleBasedRiskScore': risk_profile.rule_based_risk_score,
            'mlPredictedRiskScore': risk_profile.ml_predicted_risk_score,
            'assignedRiskCategory': risk_profile.assigned_risk_category.value,
            'detectionMethod': risk_profile.detection_method,
        })

    except Exception as exc:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(exc)}), 500


# ── POST /retrain ──────────────────────────────────────────────────────────────

@app.route('/retrain', methods=['POST'])
def retrain():
    """
    Triggers a full model retrain by running train_models.py as a subprocess.

    Protected by X-Admin-Token header (matches ADMIN_TOKEN env var).

    Returns the updated model_metadata.json on success.
    """
    expected_token = os.environ.get('ADMIN_TOKEN', 'raksharide-admin')
    provided_token = request.headers.get('X-Admin-Token', '')
    if provided_token != expected_token:
        return jsonify({'success': False, 'error': 'Unauthorized — invalid X-Admin-Token'}), 401

    try:
        train_script = os.path.join(os.path.dirname(__file__), 'train_models.py')
        result = subprocess.run(
            [sys.executable, train_script],
            capture_output=True, text=True, timeout=120,
        )

        if result.returncode != 0:
            return jsonify({
                'success': False,
                'error': 'Training script failed.',
                'stderr': result.stderr[-2000:],
            }), 500

        # Reload models after retraining
        import importlib
        import anomaly_detector
        import risk_assessment
        anomaly_detector._load_fraud_model()
        risk_assessment._load_risk_model()

        meta = _load_model_metadata()
        return jsonify({
            'success': True,
            'message': 'Models retrained successfully.',
            'stdout': result.stdout[-2000:],
            'updatedMetadata': meta,
        })

    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'error': 'Training timed out after 120 s.'}), 504
    except Exception as exc:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(exc)}), 500


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print(f'RakshaRide AI Server (ML-enhanced) starting on {AI_SERVICE_PUBLIC_BASE_URL}')
    meta = _load_model_metadata()
    if meta.get('trained_at'):
        print(f'  Models trained at: {meta["trained_at"]}')
        fraud_acc = meta.get('fraud_classifier', {}).get('metrics', {}).get('accuracy')
        if fraud_acc:
            print(f'  Fraud classifier accuracy: {fraud_acc:.2%}')
    else:
        print('  ⚠️  No trained models found. Run: py train_models.py')
    app.run(host=AI_SERVICE_HOST, port=AI_SERVICE_PORT, debug=AI_SERVICE_DEBUG)
