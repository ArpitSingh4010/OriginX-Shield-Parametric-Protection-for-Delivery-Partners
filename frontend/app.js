const API_BASE_URL_STORAGE_KEY = 'gigshield.apiBaseUrl';

const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const saveApiBaseUrlButton = document.getElementById('saveApiBaseUrlButton');
const healthCheckButton = document.getElementById('healthCheckButton');
const pricingMetadataButton = document.getElementById('pricingMetadataButton');
const responseOutput = document.getElementById('responseOutput');

function getApiBaseUrl() {
  const saved = localStorage.getItem(API_BASE_URL_STORAGE_KEY);
  return saved || 'http://localhost:5000/api';
}

function setApiBaseUrl(url) {
  const normalizedUrl = url.trim().replace(/\/+$/, '');
  localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalizedUrl);
  apiBaseUrlInput.value = normalizedUrl;
}

function setResponseOutput(payload) {
  responseOutput.textContent =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function requestJson(path) {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`);
  const data = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error((data && data.message) || `Request failed with status ${response.status}.`);
  }
  return data;
}

saveApiBaseUrlButton.addEventListener('click', () => {
  setApiBaseUrl(apiBaseUrlInput.value || '');
  setResponseOutput({ success: true, message: 'API URL saved.' });
});

healthCheckButton.addEventListener('click', async () => {
  try {
    const baseUrl = getApiBaseUrl();
    const backendRootUrl = baseUrl.endsWith('/api') ? baseUrl.slice(0, -4) : baseUrl;
    const response = await fetch(`${backendRootUrl}/api/health`);
    const data = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error((data && data.message) || `Health check failed with status ${response.status}.`);
    }
    setResponseOutput(data);
  } catch (error) {
    setResponseOutput({ success: false, error: error.message });
  }
});

pricingMetadataButton.addEventListener('click', async () => {
  try {
    const data = await requestJson('/insurance-policies/metadata/pricing-model');
    setResponseOutput(data);
  } catch (error) {
    setResponseOutput({ success: false, error: error.message });
  }
});

apiBaseUrlInput.value = getApiBaseUrl();
