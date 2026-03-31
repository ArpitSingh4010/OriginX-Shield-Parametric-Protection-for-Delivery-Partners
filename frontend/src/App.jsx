import { useMemo, useState } from 'react'

const API_BASE_URL_STORAGE_KEY = 'gigshield.apiBaseUrl'

const TABS = [
  { key: 'registration', label: 'Registration' },
  { key: 'subscription', label: 'Plan Subscription' },
  { key: 'claim', label: 'Claim Submission' },
  { key: 'tracking', label: 'Tracking Dashboard' },
]

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || '').trim().replace(/\/+$/, '')
}

async function requestJson(baseUrl, path, options = {}, accessToken = '') {
  const mergedHeaders = {
    ...(options.headers || {}),
  }

  if (accessToken) {
    mergedHeaders.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    ...options,
    headers: mergedHeaders,
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`)
  }
  return payload
}

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(
    localStorage.getItem(API_BASE_URL_STORAGE_KEY) || 'http://localhost:5000/api',
  )
  const [activeTab, setActiveTab] = useState('registration')
  const [accessToken, setAccessToken] = useState('')
  const [authUsername, setAuthUsername] = useState('admin')
  const [authPassword, setAuthPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [responseData, setResponseData] = useState(null)
  const [lastCreatedIds, setLastCreatedIds] = useState({
    partnerId: '',
    policyId: '',
    claimId: '',
  })

  const [registrationForm, setRegistrationForm] = useState({
    fullName: '',
    emailAddress: '',
    mobilePhoneNumber: '',
    primaryDeliveryCity: '',
    latitude: '13.0827',
    longitude: '80.2707',
    deliveryPlatformNames: 'swiggy',
    averageMonthlyEarningsInRupees: '22000',
  })

  const [subscriptionForm, setSubscriptionForm] = useState({
    deliveryPartnerId: '',
    selectedPlanTier: 'standard',
  })

  const [claimForm, setClaimForm] = useState({
    deliveryPartnerId: '',
    triggeringDisruptionEventId: '',
    rainfallInMillimetres: '60',
    partnerLatitude: '13.0827',
    partnerLongitude: '80.2707',
    networkLatitude: '13.0830',
    networkLongitude: '80.2709',
    minutesActiveOnDeliveryPlatform: '45',
  })

  const [trackingForm, setTrackingForm] = useState({
    partnerId: '',
    policyId: '',
    claimId: '',
  })

  const formattedResponse = useMemo(
    () => (responseData ? JSON.stringify(responseData, null, 2) : 'No API response yet.'),
    [responseData],
  )

  function updateField(setter, fieldName, fieldValue) {
    setter((previousForm) => ({ ...previousForm, [fieldName]: fieldValue }))
  }

  function saveApiBaseUrl() {
    const normalizedValue = normalizeBaseUrl(apiBaseUrl)
    localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalizedValue)
    setApiBaseUrl(normalizedValue)
  }

  async function executeApiAction(actionFn) {
    try {
      setIsLoading(true)
      setErrorMessage('')
      const payload = await actionFn()
      setResponseData(payload)
    } catch (error) {
      setErrorMessage(error.message)
      setResponseData(null)
    } finally {
      setIsLoading(false)
    }
  }

  function validateRequiredField(value, label) {
    if (!String(value || '').trim()) {
      throw new Error(`${label} is required.`)
    }
  }

  async function handleRegistrationSubmit(event) {
    event.preventDefault()
    await executeApiAction(async () => {
      validateRequiredField(registrationForm.fullName, 'Full name')
      validateRequiredField(registrationForm.emailAddress, 'Email')
      validateRequiredField(registrationForm.mobilePhoneNumber, 'Phone number')
      validateRequiredField(registrationForm.primaryDeliveryCity, 'City')

      const payload = await requestJson(
        apiBaseUrl,
        '/delivery-partners/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: registrationForm.fullName,
            emailAddress: registrationForm.emailAddress,
            mobilePhoneNumber: registrationForm.mobilePhoneNumber,
            primaryDeliveryCity: registrationForm.primaryDeliveryCity,
            primaryDeliveryZoneCoordinates: {
              latitude: Number(registrationForm.latitude),
              longitude: Number(registrationForm.longitude),
            },
            deliveryPlatformNames: registrationForm.deliveryPlatformNames
              .split(',')
              .map((platform) => platform.trim().toLowerCase())
              .filter(Boolean),
            averageMonthlyEarningsInRupees: Number(registrationForm.averageMonthlyEarningsInRupees),
          }),
        },
        accessToken,
      )

      const partnerId = payload?.deliveryPartner?.partnerId || ''
      if (partnerId) {
        setLastCreatedIds((previousIds) => ({ ...previousIds, partnerId }))
        setSubscriptionForm((previousForm) => ({ ...previousForm, deliveryPartnerId: partnerId }))
        setClaimForm((previousForm) => ({ ...previousForm, deliveryPartnerId: partnerId }))
        setTrackingForm((previousForm) => ({ ...previousForm, partnerId }))
      }

      return payload
    })
  }

  async function handleSubscriptionSubmit(event) {
    event.preventDefault()
    await executeApiAction(async () => {
      validateRequiredField(subscriptionForm.deliveryPartnerId, 'Delivery partner ID')

      const payload = await requestJson(
        apiBaseUrl,
        '/insurance-policies/subscribe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deliveryPartnerId: subscriptionForm.deliveryPartnerId,
            selectedPlanTier: subscriptionForm.selectedPlanTier,
          }),
        },
        accessToken,
      )

      const policyId = payload?.insurancePolicy?.policyId || ''
      if (policyId) {
        setLastCreatedIds((previousIds) => ({ ...previousIds, policyId }))
        setTrackingForm((previousForm) => ({ ...previousForm, policyId }))
      }

      return payload
    })
  }

  async function handleClaimSubmit(event) {
    event.preventDefault()
    await executeApiAction(async () => {
      validateRequiredField(claimForm.deliveryPartnerId, 'Delivery partner ID')
      validateRequiredField(claimForm.triggeringDisruptionEventId, 'Disruption event ID')

      const payload = await requestJson(
        apiBaseUrl,
        '/insurance-claims/submit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deliveryPartnerId: claimForm.deliveryPartnerId,
            triggeringDisruptionEventId: claimForm.triggeringDisruptionEventId,
            currentEnvironmentalConditions: {
              rainfallInMillimetres: Number(claimForm.rainfallInMillimetres),
            },
            partnerLocationAtDisruptionTime: {
              latitude: Number(claimForm.partnerLatitude),
              longitude: Number(claimForm.partnerLongitude),
            },
            networkSignalCoordinates: {
              latitude: Number(claimForm.networkLatitude),
              longitude: Number(claimForm.networkLongitude),
            },
            minutesActiveOnDeliveryPlatform: Number(claimForm.minutesActiveOnDeliveryPlatform),
          }),
        },
        accessToken,
      )

      const claimId = payload?.claim?.claimId || ''
      if (claimId) {
        setLastCreatedIds((previousIds) => ({ ...previousIds, claimId }))
        setTrackingForm((previousForm) => ({ ...previousForm, claimId }))
      }

      return payload
    })
  }

  async function fetchTrackingData(path) {
    await executeApiAction(async () => requestJson(apiBaseUrl, path, {}, accessToken))
  }

  async function handleTokenRequest() {
    await executeApiAction(async () => {
      validateRequiredField(authUsername, 'Auth username')
      validateRequiredField(authPassword, 'Auth password')

      const payload = await requestJson(
        apiBaseUrl,
        '/auth/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: authUsername,
            password: authPassword,
          }),
        },
        accessToken,
      )

      if (payload?.accessToken) {
        setAccessToken(payload.accessToken)
      }

      return payload
    })
  }

  const inputClassName =
    'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <main className="min-h-screen bg-slate-100 py-8 text-slate-900">
      <div className="mx-auto w-full max-w-6xl px-4">
        <header className="mb-6 rounded-lg bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-semibold">GigShield Frontend (React + Tailwind)</h1>
          <p className="mt-1 text-sm text-slate-600">
            Registration, subscription, claim submission, and tracking flows with validation, loading, and error UX.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              className={inputClassName}
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder="http://localhost:5000/api"
              aria-label="API Base URL"
            />
            <button
              type="button"
              onClick={saveApiBaseUrl}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Save API URL
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input
              className={inputClassName}
              value={authUsername}
              onChange={(event) => setAuthUsername(event.target.value)}
              placeholder="Auth username"
            />
            <input
              className={inputClassName}
              type="password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder="Auth password"
            />
            <button
              type="button"
              onClick={handleTokenRequest}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Request Access Token
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Auth token status: {accessToken ? 'loaded' : 'not loaded'}
          </p>
        </header>

        <nav className="mb-5 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                activeTab === tab.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-700 shadow-sm hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-lg bg-white p-5 shadow-sm">
            {activeTab === 'registration' && (
              <form className="space-y-3" onSubmit={handleRegistrationSubmit}>
                <h2 className="text-lg font-semibold">Delivery Partner Registration</h2>
                <Input label="Full name" value={registrationForm.fullName} onChange={(value) => updateField(setRegistrationForm, 'fullName', value)} />
                <Input label="Email" value={registrationForm.emailAddress} onChange={(value) => updateField(setRegistrationForm, 'emailAddress', value)} />
                <Input label="Mobile phone" value={registrationForm.mobilePhoneNumber} onChange={(value) => updateField(setRegistrationForm, 'mobilePhoneNumber', value)} />
                <Input label="City" value={registrationForm.primaryDeliveryCity} onChange={(value) => updateField(setRegistrationForm, 'primaryDeliveryCity', value)} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Latitude" value={registrationForm.latitude} onChange={(value) => updateField(setRegistrationForm, 'latitude', value)} />
                  <Input label="Longitude" value={registrationForm.longitude} onChange={(value) => updateField(setRegistrationForm, 'longitude', value)} />
                </div>
                <Input
                  label="Platforms (comma separated)"
                  value={registrationForm.deliveryPlatformNames}
                  onChange={(value) => updateField(setRegistrationForm, 'deliveryPlatformNames', value)}
                />
                <Input
                  label="Average monthly earnings (INR)"
                  value={registrationForm.averageMonthlyEarningsInRupees}
                  onChange={(value) => updateField(setRegistrationForm, 'averageMonthlyEarningsInRupees', value)}
                />
                <SubmitButton isLoading={isLoading} label="Register Partner" />
              </form>
            )}

            {activeTab === 'subscription' && (
              <form className="space-y-3" onSubmit={handleSubscriptionSubmit}>
                <h2 className="text-lg font-semibold">Plan Subscription</h2>
                <Input
                  label="Delivery partner ID"
                  value={subscriptionForm.deliveryPartnerId}
                  onChange={(value) => updateField(setSubscriptionForm, 'deliveryPartnerId', value)}
                />
                <label className="block text-sm font-medium text-slate-700">
                  Plan tier
                  <select
                    className={inputClassName}
                    value={subscriptionForm.selectedPlanTier}
                    onChange={(event) => updateField(setSubscriptionForm, 'selectedPlanTier', event.target.value)}
                  >
                    <option value="basic">Basic</option>
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                  </select>
                </label>
                <SubmitButton isLoading={isLoading} label="Subscribe Plan" />
              </form>
            )}

            {activeTab === 'claim' && (
              <form className="space-y-3" onSubmit={handleClaimSubmit}>
                <h2 className="text-lg font-semibold">Claim Submission</h2>
                <Input label="Delivery partner ID" value={claimForm.deliveryPartnerId} onChange={(value) => updateField(setClaimForm, 'deliveryPartnerId', value)} />
                <Input
                  label="Disruption event ID"
                  value={claimForm.triggeringDisruptionEventId}
                  onChange={(value) => updateField(setClaimForm, 'triggeringDisruptionEventId', value)}
                />
                <Input
                  label="Rainfall (mm)"
                  value={claimForm.rainfallInMillimetres}
                  onChange={(value) => updateField(setClaimForm, 'rainfallInMillimetres', value)}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Partner latitude" value={claimForm.partnerLatitude} onChange={(value) => updateField(setClaimForm, 'partnerLatitude', value)} />
                  <Input label="Partner longitude" value={claimForm.partnerLongitude} onChange={(value) => updateField(setClaimForm, 'partnerLongitude', value)} />
                  <Input label="Network latitude" value={claimForm.networkLatitude} onChange={(value) => updateField(setClaimForm, 'networkLatitude', value)} />
                  <Input label="Network longitude" value={claimForm.networkLongitude} onChange={(value) => updateField(setClaimForm, 'networkLongitude', value)} />
                </div>
                <Input
                  label="Minutes active on platform"
                  value={claimForm.minutesActiveOnDeliveryPlatform}
                  onChange={(value) => updateField(setClaimForm, 'minutesActiveOnDeliveryPlatform', value)}
                />
                <SubmitButton isLoading={isLoading} label="Submit Claim" />
              </form>
            )}

            {activeTab === 'tracking' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Policy / Claim Tracking Dashboard</h2>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p><span className="font-semibold">Last partner ID:</span> {lastCreatedIds.partnerId || '-'}</p>
                  <p><span className="font-semibold">Last policy ID:</span> {lastCreatedIds.policyId || '-'}</p>
                  <p><span className="font-semibold">Last claim ID:</span> {lastCreatedIds.claimId || '-'}</p>
                </div>
                <div className="space-y-2">
                  <Input label="Partner ID" value={trackingForm.partnerId} onChange={(value) => updateField(setTrackingForm, 'partnerId', value)} />
                  <button
                    type="button"
                    onClick={() => fetchTrackingData(`/delivery-partners/${trackingForm.partnerId}`)}
                    className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
                  >
                    Fetch Partner Profile
                  </button>
                </div>
                <div className="space-y-2">
                  <Input label="Policy ID" value={trackingForm.policyId} onChange={(value) => updateField(setTrackingForm, 'policyId', value)} />
                  <button
                    type="button"
                    onClick={() => fetchTrackingData(`/insurance-policies/${trackingForm.policyId}`)}
                    className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
                  >
                    Fetch Policy Status
                  </button>
                </div>
                <div className="space-y-2">
                  <Input label="Claim ID" value={trackingForm.claimId} onChange={(value) => updateField(setTrackingForm, 'claimId', value)} />
                  <button
                    type="button"
                    onClick={() => fetchTrackingData(`/insurance-claims/${trackingForm.claimId}`)}
                    className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
                  >
                    Fetch Claim Status
                  </button>
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Live API Response</h2>
            {isLoading && <p className="mt-2 rounded-md bg-blue-50 p-2 text-sm text-blue-700">Loading...</p>}
            {errorMessage && (
              <p className="mt-2 rounded-md bg-rose-50 p-2 text-sm text-rose-700">
                Error: {errorMessage}
              </p>
            )}
            <pre className="mt-3 max-h-[540px] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {formattedResponse}
            </pre>
          </aside>
        </section>
      </div>
    </main>
  )
}

function Input({ label, value, onChange }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SubmitButton({ isLoading, label }) {
  return (
    <button
      type="submit"
      disabled={isLoading}
      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoading ? 'Please wait...' : label}
    </button>
  )
}

export default App
