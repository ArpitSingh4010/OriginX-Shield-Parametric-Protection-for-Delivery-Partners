"""
GigShield AI Server â€” Flask REST API

Exposes the existing Python AI modules (risk_assessment.py and
anomaly_detector.py) as HTTP endpoints so the Node.js backend and
frontend can integrate with the AI risk + fraud detection logic.

Runs on port 5001 by default.

Start with:
    pip install flask flask-cors
    python app.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys, os, traceback

# Make the ai/ directory importable.
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
CORS(app)   # Allow requests from the React frontend / Node.js backend.

AI_SERVICE_PORT = int(os.environ.get('AI_SERVICE_PORT', '5001'))
AI_SERVICE_HOST = os.environ.get('AI_SERVICE_HOST', '0.0.0.0')
AI_SERVICE_DEBUG = os.environ.get('AI_SERVICE_DEBUG', 'true').lower() == 'true'
AI_SERVICE_PUBLIC_BASE_URL = os.environ.get(
    'AI_SERVICE_PUBLIC_BASE_URL',
    f'http://localhost:{AI_SERVICE_PORT}'
)


# â”€â”€â”€ Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'status': 'ok',
        'service': 'GigShield AI Server',
        'message': 'AI service is running. Use /health for health checks.',
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'service': 'GigShield AI Server',
        'port': AI_SERVICE_PORT,
    })


# â”€â”€â”€ POST /assess-risk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.route('/assess-risk', methods=['POST'])
def assess_risk():
    """
    Calculates the location risk score and category for a delivery zone
    based on its historical disruption records.

    Request body (JSON):
    {
        "zoneCityName": "Chennai",
        "zoneCentreLatitude": 13.0827,
        "zoneCentreLongitude": 80.2707,
        "observationPeriodInWeeks": 52,          // optional, default 52
        "historicalDisruptionRecords": [         // list of past events
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

    Response body:
    {
        "success": true,
        "zoneCityName": "Chennai",
        "computedRiskScore": 0.42,
        "assignedRiskCategory": "moderate_risk_zone",
        "observationPeriodInWeeks": 52,
        "totalHistoricalDisruptionRecords": 1
    }
    """
    try:
        body = request.get_json(force=True)

        zone_city_name            = body.get('zoneCityName', 'Unknown')
        zone_centre_latitude      = float(body.get('zoneCentreLatitude', 0.0))
        zone_centre_longitude     = float(body.get('zoneCentreLongitude', 0.0))
        observation_period_weeks  = int(body.get('observationPeriodInWeeks', 52))
        raw_records               = body.get('historicalDisruptionRecords', [])

        historical_records = [
            HistoricalDisruptionRecord(
                disruption_type=rec.get('disruptionType', 'unknown'),
                rainfall_in_millimetres=float(rec.get('rainfallInMillimetres', 0.0)),
                temperature_in_celsius=float(rec.get('temperatureInCelsius', 0.0)),
                air_quality_index=float(rec.get('airQualityIndex', 0.0)),
                duration_in_hours=float(rec.get('durationInHours', 0.0)),
                estimated_income_loss_percentage=float(
                    rec.get('estimatedIncomeLossPercentage', 0.0)
                ),
            )
            for rec in raw_records
        ]

        risk_profile = assess_delivery_zone_risk_profile(
            zone_city_name=zone_city_name,
            zone_centre_latitude=zone_centre_latitude,
            zone_centre_longitude=zone_centre_longitude,
            historical_disruption_records=historical_records,
            observation_period_in_weeks=observation_period_weeks,
        )

        return jsonify({
            'success': True,
            'zoneCityName': risk_profile.zone_city_name,
            'computedRiskScore': risk_profile.computed_risk_score,
            'assignedRiskCategory': risk_profile.assigned_risk_category.value,
            'observationPeriodInWeeks': observation_period_weeks,
            'totalHistoricalDisruptionRecords': len(historical_records),
        })

    except Exception as exc:
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(exc),
        }), 500


# â”€â”€â”€ POST /detect-anomaly â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.route('/detect-anomaly', methods=['POST'])
def detect_anomaly():
    """
    Runs the anomaly detection pipeline on a single insurance claim
    and returns a fraud risk assessment report.

    Request body (JSON):
    {
        "claimId": "claim_abc123",
        "deliveryPartnerId": "partner_xyz",
        "numberOfClaimsFiledInLastSevenDays": 2,
        "partnerReportedLatitudeAtClaimTime": 13.0827,
        "partnerReportedLongitudeAtClaimTime": 80.2707,
        "disruptionEpicentreLatitude": 13.0900,
        "disruptionEpicentreLongitude": 80.2750,
        "minutesActiveOnDeliveryPlatformDuringDisruption": 45,
        "disruptionDurationInMinutes": 120
    }

    Response body:
    {
        "success": true,
        "claimId": "claim_abc123",
        "isClaimFrequencyAnomalous": false,
        "isLocationMismatchDetected": false,
        "isActivitySignalMismatchDetected": false,
        "overallAnomalyRiskScore": 0.0,
        "shouldFlagForManualReview": false,
        "anomalyDetectionNotes": []
    }
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
            disruption_epicentre_latitude=float(
                body.get('disruptionEpicentreLatitude', 0.0)
            ),
            disruption_epicentre_longitude=float(
                body.get('disruptionEpicentreLongitude', 0.0)
            ),
            minutes_active_on_delivery_platform_during_disruption=int(
                body.get('minutesActiveOnDeliveryPlatformDuringDisruption', 0)
            ),
            disruption_duration_in_minutes=int(
                body.get('disruptionDurationInMinutes', 60)
            ),
        )

        report = run_anomaly_detection_checks_for_claim(claim_record)

        return jsonify({
            'success': True,
            'claimId': report.claim_id,
            'isClaimFrequencyAnomalous': report.is_claim_frequency_anomalous,
            'isLocationMismatchDetected': report.is_location_mismatch_detected,
            'isActivitySignalMismatchDetected': report.is_activity_signal_mismatch_detected,
            'overallAnomalyRiskScore': report.overall_anomaly_risk_score,
            'shouldFlagForManualReview': report.should_flag_for_manual_review,
            'anomalyDetectionNotes': report.anomaly_detection_notes,
        })

    except Exception as exc:
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(exc),
        }), 500


# â”€â”€â”€ POST /quick-risk-assess â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.route('/quick-risk-assess', methods=['POST'])
def quick_risk_assess():
    """
    Simplified risk assessment using only city name and preset city data.
    Useful for the frontend registration flow where users just select a city.

    Request body: { "cityName": "Chennai" }
    """
    CITY_PRESETS = {
        'chennai':    {'lat': 13.0827, 'lon': 80.2707, 'records': 18, 'avg_loss': 28.0, 'weeks': 52},
        'mumbai':     {'lat': 19.0760, 'lon': 72.8777, 'records': 20, 'avg_loss': 32.0, 'weeks': 52},
        'delhi':      {'lat': 28.6139, 'lon': 77.2090, 'records': 22, 'avg_loss': 35.0, 'weeks': 52},
        'bengaluru':  {'lat': 12.9716, 'lon': 77.5946, 'records': 14, 'avg_loss': 20.0, 'weeks': 52},
        'hyderabad':  {'lat': 17.3850, 'lon': 78.4867, 'records': 12, 'avg_loss': 18.0, 'weeks': 52},
        'kolkata':    {'lat': 22.5726, 'lon': 88.3639, 'records': 16, 'avg_loss': 25.0, 'weeks': 52},
        'pune':       {'lat': 18.5204, 'lon': 73.8567, 'records': 10, 'avg_loss': 15.0, 'weeks': 52},
        'ahmedabad':  {'lat': 23.0225, 'lon': 72.5714, 'records':  8, 'avg_loss': 12.0, 'weeks': 52},
    }

    try:
        body = request.get_json(force=True)
        city_name = body.get('cityName', '').strip().lower()
        preset = CITY_PRESETS.get(city_name, {'lat': 0, 'lon': 0, 'records': 5, 'avg_loss': 15.0, 'weeks': 52})

        # Synthesise historical records from preset averages.
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
        )

        return jsonify({
            'success': True,
            'cityName': body.get('cityName', city_name),
            'computedRiskScore': risk_profile.computed_risk_score,
            'assignedRiskCategory': risk_profile.assigned_risk_category.value,
        })

    except Exception as exc:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(exc)}), 500


# â”€â”€â”€ Entry Point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

if __name__ == '__main__':
    print(f'GigShield AI Server starting on {AI_SERVICE_PUBLIC_BASE_URL}')
    app.run(host=AI_SERVICE_HOST, port=AI_SERVICE_PORT, debug=AI_SERVICE_DEBUG)


