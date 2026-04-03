'use strict';

const AI_SERVICE_BASE_URL = process.env.AI_SERVICE_BASE_URL || 'http://localhost:5001';
const DEFAULT_AI_REQUEST_TIMEOUT_IN_MILLISECONDS = 2500;
const AI_REQUEST_TIMEOUT_IN_MILLISECONDS =
  Number(process.env.AI_REQUEST_TIMEOUT_MS) || DEFAULT_AI_REQUEST_TIMEOUT_IN_MILLISECONDS;

const CITY_RISK_FALLBACK_MAP = {
  chennai: 'high_risk_zone',
  mumbai: 'high_risk_zone',
  delhi: 'very_high_risk_zone',
  bengaluru: 'moderate_risk_zone',
  hyderabad: 'moderate_risk_zone',
  kolkata: 'high_risk_zone',
  pune: 'moderate_risk_zone',
  ahmedabad: 'low_risk_zone',
};

async function postJsonWithTimeout(path, requestBody) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), AI_REQUEST_TIMEOUT_IN_MILLISECONDS);

  try {
    const response = await fetch(`${AI_SERVICE_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`AI service returned HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function resolveFallbackRiskCategory(cityName = '') {
  const cityKey = String(cityName).trim().toLowerCase();
  return CITY_RISK_FALLBACK_MAP[cityKey] || 'moderate_risk_zone';
}

async function assessCityRiskWithAi(cityName) {
  try {
    const aiResponse = await postJsonWithTimeout('/quick-risk-assess', { cityName });
    const assignedRiskCategory = (aiResponse.assignedRiskCategory || 'moderate_risk_zone')
      .toLowerCase();

    return {
      source: 'ai',
      assignedRiskCategory,
      computedRiskScore: Number(aiResponse.computedRiskScore || 0),
    };
  } catch (error) {
    return {
      source: 'fallback',
      assignedRiskCategory: resolveFallbackRiskCategory(cityName),
      computedRiskScore: null,
      errorDetails: error.message,
    };
  }
}

async function detectClaimAnomalyWithAi(claimInput) {
  try {
    const aiResponse = await postJsonWithTimeout('/detect-anomaly', claimInput);

    return {
      isAvailable: true,
      overallAnomalyRiskScore: Number(aiResponse.overallAnomalyRiskScore || 0),
      shouldFlagForManualReview: Boolean(aiResponse.shouldFlagForManualReview),
      anomalyDetectionNotes: Array.isArray(aiResponse.anomalyDetectionNotes)
        ? aiResponse.anomalyDetectionNotes
        : [],
    };
  } catch (error) {
    return {
      isAvailable: false,
      overallAnomalyRiskScore: null,
      shouldFlagForManualReview: false,
      anomalyDetectionNotes: [],
      errorDetails: error.message,
    };
  }
}

module.exports = {
  AI_SERVICE_BASE_URL,
  assessCityRiskWithAi,
  detectClaimAnomalyWithAi,
};
