/**
 * RakshaRide API client.
 * Wraps all fetch calls to the Node.js backend (/api) and Python AI server (/ai).
 */

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const AI   = import.meta.env.VITE_AI_BASE_URL  || '/ai';

async function request(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await res.json()
      : { message: await res.text() };

    if (!res.ok) {
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const formattedValidationErrors = data.errors
          .map((validationError) => validationError?.msg)
          .filter(Boolean)
          .join(' | ');

        throw new Error(formattedValidationErrors || data.message || 'Request validation failed.');
      }

      throw new Error(data.errorDetails || data.error || data.message || 'Request failed');
    }

    return data;
  } catch (error) {
    // Safari often reports network/CORS failures as "Load failed".
    if (error?.name === 'TypeError') {
      throw new Error('Network error. Please check your deployed API URL and CORS configuration.');
    }

    throw error;
  }
}

function createAdminAuthHeaders(adminAccessToken) {
  if (!adminAccessToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${adminAccessToken}`,
  };
}

// ----- Delivery Partners -----------------------------------------------------
export const registerPartner     = (body)           => request(`${BASE}/delivery-partners/register`, { method: 'POST', body: JSON.stringify(body) });
export const loginDeliveryPartner = (body)          => request(`${BASE}/delivery-partners/login`, { method: 'POST', body: JSON.stringify(body) });
export const requestPartnerEmailVerificationOtp = (body) => request(`${BASE}/delivery-partners/request-email-verification-otp`, { method: 'POST', body: JSON.stringify(body) });
export const verifyPartnerEmailOtp = (body) => request(`${BASE}/delivery-partners/verify-email-otp`, { method: 'POST', body: JSON.stringify(body) });
export const resendPartnerEmailVerificationOtp = (body) => request(`${BASE}/delivery-partners/resend-otp`, { method: 'POST', body: JSON.stringify(body) });
export const requestPartnerPasswordResetOtp = (body) => request(`${BASE}/delivery-partners/forgot-password`, { method: 'POST', body: JSON.stringify(body) });
export const resetPartnerPasswordWithOtp = (body) => request(`${BASE}/delivery-partners/reset-password`, { method: 'POST', body: JSON.stringify(body) });
export const getPartner          = (id)             => request(`${BASE}/delivery-partners/${id}`);
export const listPartners        = (params = {})    => request(`${BASE}/delivery-partners?${new URLSearchParams(params)}`);
export const verifyPartner       = (id)             => request(`${BASE}/delivery-partners/${id}/verify`, { method: 'PATCH' });
export const updatePartner       = (id, body)       => request(`${BASE}/delivery-partners/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

// ----- Insurance Policies ----------------------------------------------------
export const subscribePolicy          = (body)      => request(`${BASE}/insurance-policies/subscribe`,             { method: 'POST', body: JSON.stringify(body) });
export const createPaymentOrder       = (body)      => request(`${BASE}/insurance-policies/create-payment-order`,  { method: 'POST', body: JSON.stringify(body) });
export const verifyPayment            = (body)      => request(`${BASE}/insurance-policies/verify-payment`,        { method: 'POST', body: JSON.stringify(body) });
export const getPricingMetadata       = ()          => request(`${BASE}/insurance-policies/metadata/pricing-model`);
export const getPolicy                = (id)        => request(`${BASE}/insurance-policies/${id}`);
export const getPartnerPolicies       = (partnerId) => request(`${BASE}/insurance-policies/partner/${partnerId}`);
export const cancelPolicy             = (id)        => request(`${BASE}/insurance-policies/${id}/cancel`, { method: 'PATCH' });

// ----- Insurance Claims ------------------------------------------------------
export const submitClaim          = (body)          => request(`${BASE}/insurance-claims/submit`,                 { method: 'POST', body: JSON.stringify(body) });
export const getClaim             = (id)            => request(`${BASE}/insurance-claims/${id}`);
export const getPartnerClaims     = (partnerId, p)  => request(`${BASE}/insurance-claims/partner/${partnerId}?${new URLSearchParams(p || {})}`);
export const getFlaggedClaims     = (p, adminAccessToken) => request(`${BASE}/insurance-claims/flagged?${new URLSearchParams(p || {})}`, {
  method: 'GET',
  headers: createAdminAuthHeaders(adminAccessToken),
});
export const reviewClaim          = (id, body, adminAccessToken)      => request(`${BASE}/insurance-claims/${id}/review`,           {
  method: 'PATCH',
  headers: createAdminAuthHeaders(adminAccessToken),
  body: JSON.stringify(body),
});

// ----- Disruption Events -----------------------------------------------------
export const createDisruptionEvent      = (body, adminAccessToken)    => request(`${BASE}/disruption-events`,                            {
  method: 'POST',
  headers: createAdminAuthHeaders(adminAccessToken),
  body: JSON.stringify(body),
});
export const listDisruptionEvents       = (p)       => request(`${BASE}/disruption-events?${new URLSearchParams(p || {})}`);
export const getDisruptionEvent         = (id)      => request(`${BASE}/disruption-events/${id}`);
export const checkThreshold             = (body)    => request(`${BASE}/disruption-events/check-threshold`,            { method: 'POST', body: JSON.stringify(body) });
export const triggerClaimsForEvent      = (id, body, adminAccessToken)=> request(`${BASE}/disruption-events/${id}/trigger-claims`,       {
  method: 'POST',
  headers: createAdminAuthHeaders(adminAccessToken),
  body: JSON.stringify(body),
});

// ----- Admin -----------------------------------------------------------------
export const triggerWeatherCheck = (adminAccessToken) => request(`${BASE}/admin/trigger-weather-check`, {
  method: 'POST',
  headers: createAdminAuthHeaders(adminAccessToken),
});
export const healthCheck         = () => request(`${BASE}/health`);
export const loginAdmin          = (body) => request(`${BASE}/auth/admin/login`, { method: 'POST', body: JSON.stringify(body) });
export const listAdminUsers      = (adminAccessToken) => request(`${BASE}/auth/admins`, {
  method: 'GET',
  headers: createAdminAuthHeaders(adminAccessToken),
});
export const addAdminUser        = (body, adminAccessToken) => request(`${BASE}/auth/admins`, {
  method: 'POST',
  headers: createAdminAuthHeaders(adminAccessToken),
  body: JSON.stringify(body),
});

// ----- Python AI -------------------------------------------------------------
export const aiQuickRiskAssess   = (body) => request(`${AI}/quick-risk-assess`, { method: 'POST', body: JSON.stringify(body) });
export const aiAssessRisk        = (body) => request(`${AI}/assess-risk`,       { method: 'POST', body: JSON.stringify(body) });
export const aiDetectAnomaly     = (body) => request(`${AI}/detect-anomaly`,    { method: 'POST', body: JSON.stringify(body) });

