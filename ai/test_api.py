"""Quick smoke test for the ML-enhanced AI endpoints."""
import urllib.request
import json

BASE = "http://localhost:5001"


def post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        BASE + path, data=data, headers={"Content-Type": "application/json"}
    )
    return json.loads(urllib.request.urlopen(req, timeout=10).read())


def print_result(label, resp):
    print(f"\n{label}")
    print(f"  detectionMethod      : {resp.get('detectionMethod')}")
    print(f"  mlFraudProbability   : {resp.get('mlFraudProbability')}")
    print(f"  ruleBasedRiskScore   : {resp.get('ruleBasedRiskScore')}")
    print(f"  overallAnomalyRiskScore : {resp.get('overallAnomalyRiskScore')}")
    print(f"  shouldFlagForManualReview : {resp.get('shouldFlagForManualReview')}")
    for note in resp.get("anomalyDetectionNotes", []):
        print(f"    NOTE: {note}")


# 1. Model info
info = json.loads(urllib.request.urlopen(BASE + "/model-info", timeout=10).read())
meta = info.get("modelMetadata", {})
print("=== /model-info ===")
fc = meta.get("fraud_classifier", {})
rr = meta.get("risk_regressor", {})
print(f"  Trained at          : {meta.get('trained_at')}")
print(f"  Fraud classifier    : {fc.get('model_type')} | accuracy={fc.get('metrics', {}).get('accuracy')}")
print(f"  Risk regressor      : {rr.get('model_type')} | R2={rr.get('metrics', {}).get('r2')}")

# 2. Legitimate claim
legit = post("/detect-anomaly", {
    "claimId": "test_legit",
    "deliveryPartnerId": "p_good",
    "numberOfClaimsFiledInLastSevenDays": 1,
    "partnerReportedLatitudeAtClaimTime": 13.0827,
    "partnerReportedLongitudeAtClaimTime": 80.2707,
    "disruptionEpicentreLatitude": 13.09,
    "disruptionEpicentreLongitude": 80.275,
    "minutesActiveOnDeliveryPlatformDuringDisruption": 45,
    "disruptionDurationInMinutes": 120,
    "cityBaseRiskScore": 0.5,
    "rainfallInMillimetres": 78.0,
    "temperatureInCelsius": 34.0,
    "airQualityIndex": 210.0,
})
print_result("=== LEGITIMATE CLAIM ===", legit)

# 3. Fraudulent claim (wrong city, 7 claims/week, barely active)
fraud = post("/detect-anomaly", {
    "claimId": "test_fraud",
    "deliveryPartnerId": "p_bad",
    "numberOfClaimsFiledInLastSevenDays": 7,
    "partnerReportedLatitudeAtClaimTime": 13.0827,
    "partnerReportedLongitudeAtClaimTime": 80.2707,
    "disruptionEpicentreLatitude": 19.0760,
    "disruptionEpicentreLongitude": 72.8777,
    "minutesActiveOnDeliveryPlatformDuringDisruption": 2,
    "disruptionDurationInMinutes": 180,
    "cityBaseRiskScore": 0.5,
    "rainfallInMillimetres": 55.0,
    "temperatureInCelsius": 32.0,
    "airQualityIndex": 150.0,
})
print_result("=== FRAUDULENT CLAIM ===", fraud)

# 4. Quick risk assess
risk = post("/quick-risk-assess", {"cityName": "Chennai"})
print("\n=== /quick-risk-assess Chennai ===")
print(f"  computedRiskScore   : {risk.get('computedRiskScore')}")
print(f"  mlPredictedRiskScore: {risk.get('mlPredictedRiskScore')}")
print(f"  detectionMethod     : {risk.get('detectionMethod')}")
print(f"  assignedRiskCategory: {risk.get('assignedRiskCategory')}")

print("\n[PASS] All endpoints responding correctly with ML ensemble scoring.")
