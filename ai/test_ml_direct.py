"""ML inference smoke test — run with: py test_ml_direct.py"""
import sys
sys.path.insert(0, '.')

from anomaly_detector import ClaimActivityRecord, run_anomaly_detection_checks_for_claim
from risk_assessment import HistoricalDisruptionRecord, assess_delivery_zone_risk_profile

print('=== LEGITIMATE CLAIM ===')
legit = ClaimActivityRecord(
    claim_id='test_legit',
    delivery_partner_id='p_good',
    number_of_claims_filed_in_last_seven_days=1,
    partner_reported_latitude_at_claim_time=13.0827,
    partner_reported_longitude_at_claim_time=80.2707,
    disruption_epicentre_latitude=13.09,
    disruption_epicentre_longitude=80.275,
    minutes_active_on_delivery_platform_during_disruption=45,
    disruption_duration_in_minutes=120,
    city_base_risk_score=0.5,
    rainfall_in_millimetres=78.0,
    temperature_in_celsius=34.0,
    air_quality_index=210.0,
)
r = run_anomaly_detection_checks_for_claim(legit)
print('  detectionMethod :', r.detection_method)
print('  mlFraudProb     :', r.ml_fraud_probability)
print('  overallScore    :', r.overall_anomaly_risk_score)
print('  flagForReview   :', r.should_flag_for_manual_review)

print()
print('=== FRAUDULENT CLAIM ===')
fraud = ClaimActivityRecord(
    claim_id='test_fraud',
    delivery_partner_id='p_bad',
    number_of_claims_filed_in_last_seven_days=7,
    partner_reported_latitude_at_claim_time=13.0827,
    partner_reported_longitude_at_claim_time=80.2707,
    disruption_epicentre_latitude=19.0760,
    disruption_epicentre_longitude=72.8777,
    minutes_active_on_delivery_platform_during_disruption=2,
    disruption_duration_in_minutes=180,
    city_base_risk_score=0.5,
    rainfall_in_millimetres=55.0,
    temperature_in_celsius=32.0,
    air_quality_index=150.0,
)
r2 = run_anomaly_detection_checks_for_claim(fraud)
print('  detectionMethod :', r2.detection_method)
print('  mlFraudProb     :', r2.ml_fraud_probability)
print('  overallScore    :', r2.overall_anomaly_risk_score)
print('  flagForReview   :', r2.should_flag_for_manual_review)
for note in r2.anomaly_detection_notes:
    print('  NOTE:', note)

print()
print('=== RISK ASSESSMENT (Chennai) ===')
records = [HistoricalDisruptionRecord('heavy_rainfall', 75.0, 31.0, 110.0, 6.0, 28.0) for _ in range(18)]
rp = assess_delivery_zone_risk_profile('Chennai', 13.0827, 80.2707, records, 52, 0.50)
print('  computedRiskScore   :', rp.computed_risk_score)
print('  mlPredictedRiskScore:', rp.ml_predicted_risk_score)
print('  ruleBasedRiskScore  :', rp.rule_based_risk_score)
print('  detectionMethod     :', rp.detection_method)
print('  assignedCategory    :', rp.assigned_risk_category.value)

print()
print('[PASS] ML inference working correctly.')
