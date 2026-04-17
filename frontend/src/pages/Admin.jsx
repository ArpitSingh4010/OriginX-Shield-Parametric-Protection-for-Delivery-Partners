import React, { useState, useEffect, useCallback } from 'react';
import {
  getFlaggedClaims, reviewClaim, listDisruptionEvents,
  triggerWeatherCheck, createDisruptionEvent, listPartners, triggerClaimsForEvent,
  addAdminUser, listAdminUsers, removePartner, getAdminStats, getAiModelInfo, seedDemoData, listSupportTickets,
} from '../api/rakshaRideApi';
import {
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_CATEGORY_VALUE_TO_LABEL,
  SUPPORT_STATUS_OPTIONS,
  SUPPORT_STATUS_VALUE_TO_LABEL,
} from '../constants/support';
import StatusBadge from '../components/StatusBadge';
import DisruptionMap from '../components/DisruptionMap';

function StatLogo({ type = 'claims' }) {
  const iconByType = {
    claims: (
      <path d="M5 6h14M5 10h10M5 14h8M15 14l2 2 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    ),
    events: (
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.5 6.5l2.2 2.2M15.3 15.3l2.2 2.2M17.5 6.5l-2.2 2.2M8.7 15.3l-2.2 2.2M12 8a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    ),
    partners: (
      <path d="M8 10a3 3 0 110-6 3 3 0 010 6zm8 1a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3.5 18a4.5 4.5 0 019 0M13.5 18a3.5 3.5 0 017 0" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    ),
    verified: (
      <path d="M12 3l7 3v5c0 4.2-2.8 7.1-7 8-4.2-.9-7-3.8-7-8V6l7-3zm-3.2 8.5l2.2 2.2 4.2-4.2" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    ),
  };

  return (
    <div style={{
      width: 24,
      height: 24,
      borderRadius: 6,
      background: 'rgba(255,255,255,0.12)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
    }}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        {iconByType[type] || iconByType.claims}
      </svg>
    </div>
  );
}

function MiniBarChart({ data = [], valueKey = 'value', labelKey = 'label', barColor = '#f59e0b' }) {
  const maxValue = Math.max(1, ...data.map((entry) => Number(entry[valueKey] || 0)));

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', minHeight: 140 }}>
      {data.map((entry) => {
        const height = Math.max(8, (Number(entry[valueKey] || 0) / maxValue) * 110);
        return (
          <div key={entry[labelKey]} style={{ flex: 1, textAlign: 'center' }}>
            <div
              style={{
                height,
                background: barColor,
                borderRadius: '8px 8px 4px 4px',
                marginBottom: '0.3rem',
              }}
              title={`${entry[labelKey]}: ${entry[valueKey]}`}
            />
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{entry[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

function DonutMetric({ label, value = 0, max = 100, color = '#10b981' }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const strokeDash = ratio * circumference;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <svg width={72} height={72} viewBox="0 0 72 72">
        <circle cx={36} cy={36} r={radius} stroke="rgba(255,255,255,0.15)" strokeWidth={8} fill="none" />
        <circle
          cx={36}
          cy={36}
          r={radius}
          stroke={color}
          strokeWidth={8}
          fill="none"
          strokeDasharray={`${strokeDash} ${circumference}`}
          transform="rotate(-90 36 36)"
          strokeLinecap="round"
        />
        <text x={36} y={40} textAnchor="middle" fill="#fff" style={{ fontSize: 11, fontWeight: 700 }}>
          {Math.round(ratio * 100)}%
        </text>
      </svg>
      <div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{label}</div>
        <div style={{ fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  );
}

function MiniLineChart({ data = [], valueKey = 'totalClaims', labelKey = 'label', stroke = '#38bdf8' }) {
  if (!data.length) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No data yet</div>;
  }

  const width = 280;
  const height = 120;
  const pad = 10;
  const maxValue = Math.max(1, ...data.map((item) => Number(item[valueKey] || 0)));

  const points = data.map((item, index) => {
    const x = pad + (index / Math.max(data.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - (Number(item[valueKey] || 0) / maxValue) * (height - pad * 2);
    return `${x},${y}`;
  });

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Claims per day trend">
        <polyline points={points.join(' ')} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: '0.35rem' }}>
        {data.map((item) => <span key={item[labelKey]}>{item[labelKey]}</span>)}
      </div>
    </div>
  );
}

function ClaimsSplitPie({ claimsByStatus = {} }) {
  const approved = Number(claimsByStatus.approved_for_payout || 0) + Number(claimsByStatus.payout_processed || 0);
  const flagged = Number(claimsByStatus.flagged_for_manual_review || 0);
  const rejected = Number(claimsByStatus.rejected || 0);
  const total = Math.max(1, approved + flagged + rejected);

  const circumference = 2 * Math.PI * 24;
  const approvedArc = (approved / total) * circumference;
  const flaggedArc = (flagged / total) * circumference;
  const rejectedArc = (rejected / total) * circumference;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
      <svg width={84} height={84} viewBox="0 0 84 84" role="img" aria-label="Claims split by outcome">
        <circle cx={42} cy={42} r={24} stroke="rgba(255,255,255,0.1)" strokeWidth={10} fill="none" />
        <circle cx={42} cy={42} r={24} stroke="#10b981" strokeWidth={10} fill="none" strokeDasharray={`${approvedArc} ${circumference}`} transform="rotate(-90 42 42)" />
        <circle cx={42} cy={42} r={24} stroke="#f59e0b" strokeWidth={10} fill="none" strokeDasharray={`${flaggedArc} ${circumference}`} strokeDashoffset={-approvedArc} transform="rotate(-90 42 42)" />
        <circle cx={42} cy={42} r={24} stroke="#ef4444" strokeWidth={10} fill="none" strokeDasharray={`${rejectedArc} ${circumference}`} strokeDashoffset={-(approvedArc + flaggedArc)} transform="rotate(-90 42 42)" />
      </svg>
      <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <span>Approved: <strong style={{ color: '#10b981' }}>{approved}</strong></span>
        <span>Flagged: <strong style={{ color: '#f59e0b' }}>{flagged}</strong></span>
        <span>Rejected: <strong style={{ color: '#ef4444' }}>{rejected}</strong></span>
      </div>
    </div>
  );
}

export default function Admin({ adminAccessToken, adminProfile, onAdminLogout }) {
  const DISRUPTION_TYPE_OPTIONS = [
    { value: 'heavy_rainfall', label: 'Heavy Rainfall' },
    { value: 'extreme_heat', label: 'Extreme Heat' },
    { value: 'hazardous_air_quality', label: 'Hazardous Air Quality' },
    { value: 'lpg_shortage', label: 'LPG Shortage' },
    { value: 'area_curfew', label: 'Area Curfew' },
    { value: 'flooding', label: 'Flooding' },
    { value: 'cyclone_alert', label: 'Cyclone Alert' },
    { value: 'thunderstorm', label: 'Thunderstorm' },
    { value: 'waterlogging', label: 'Waterlogging' },
    { value: 'road_blockage', label: 'Road Blockage' },
    { value: 'other', label: 'Other (Custom)' },
  ];

  const humanizeDisruptionType = (type = '') => String(type || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  const formatInr = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

  const [flagged,   setFlagged]   = useState([]);
  const [events,    setEvents]    = useState([]);
  const [partners,  setPartners]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('claims'); // claims | events | weather
  const [reviewing, setReviewing] = useState({});
  const [note,      setNote]      = useState({});
  const [toast,     setToast]     = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherResult,  setWeatherResult]  = useState(null);
  const [adminStats, setAdminStats] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [modelInfoError, setModelInfoError] = useState('');
  const [adminUsers, setAdminUsers] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportFilters, setSupportFilters] = useState({ status: 'all', category: 'all' });
  const [newAdmin, setNewAdmin] = useState({ fullName: '', emailAddress: '', password: '' });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [removingPartnerId, setRemovingPartnerId] = useState('');
  const [seedingDemo, setSeedingDemo] = useState(false);

  const isAuthSessionError = (message = '') => {
    const normalized = String(message).toLowerCase();
    return normalized.includes('authorization token is required')
      || normalized.includes('invalid or expired authorization token')
      || normalized.includes('jwt');
  };

  const handleSessionExpiry = (errorMessage) => {
    showToast(errorMessage || 'Your admin session expired. Please login again.');
    if (onAdminLogout) {
      onAdminLogout();
    }
  };

  // New event form
  const [newEvent, setNewEvent] = useState({
    disruptionType: 'heavy_rainfall', affectedCityName: 'Chennai',
    customDisruptionTypeLabel: '',
    measuredRainfallInMillimetres: 85, measuredTemperatureInCelsius: 30, measuredAirQualityIndex: 120,
    measuredLpgShortageSeverityIndex: 0,
    affectedRadiusInKilometres: 15,
    affectedZoneCentreCoordinates: { latitude: 13.0827, longitude: 80.2707 },
  });
  const [creating, setCreating] = useState(false);
  const [triggeringEventId, setTriggeringEventId] = useState('');

  const CITY_COORDS = {
    Chennai:   { latitude: 13.0827, longitude: 80.2707 },
    Mumbai:    { latitude: 19.0760, longitude: 72.8777 },
    Delhi:     { latitude: 28.6139, longitude: 77.2090 },
    Bengaluru: { latitude: 12.9716, longitude: 77.5946 },
    Hyderabad: { latitude: 17.3850, longitude: 78.4867 },
    Kolkata:   { latitude: 22.5726, longitude: 88.3639 },
    Pune:      { latitude: 18.5204, longitude: 73.8567 },
    Ahmedabad: { latitude: 23.0225, longitude: 72.5714 },
    Jaipur:    { latitude: 26.9124, longitude: 75.7873 },
    Lucknow:   { latitude: 26.8467, longitude: 80.9462 },
    Surat:     { latitude: 21.1702, longitude: 72.8311 },
    Indore:    { latitude: 22.7196, longitude: 75.8577 },
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const loadData = useCallback(async () => {
    setLoading(true);
    setModelInfoError('');
    try {
      // Load only critical data first (flagged claims, stats)
      const [f, statsResponse] = await Promise.all([
        getFlaggedClaims({ limit: 50 }, adminAccessToken)
          .then((res) => ({ status: 'fulfilled', value: res }))
          .catch((err) => ({ status: 'rejected', reason: err })),
        getAdminStats(adminAccessToken)
          .then((response) => ({ status: 'fulfilled', value: response }))
          .catch((error) => ({ status: 'rejected', reason: error })),
      ]);

      if (f.status === 'fulfilled') {
        setFlagged(f.value.flaggedClaims || []);
      }
      if (statsResponse.status === 'fulfilled') {
        setAdminStats(statsResponse.value.stats || null);
      }

      // Defer non-critical data to background (events, partners, admin users, support tickets, AI model info)
      Promise.allSettled([
        listDisruptionEvents({ limit: 30 }),
        listPartners({ limit: 100 }),
        listAdminUsers(adminAccessToken),
        listSupportTickets({ limit: 100 }, adminAccessToken),
      ]).then(([e, p, adminList, supportList]) => {
        if (e.status === 'fulfilled') setEvents(e.value.disruptionEvents || []);
        if (p.status === 'fulfilled') setPartners(p.value.deliveryPartners || []);
        if (adminList.status === 'fulfilled') setAdminUsers(adminList.value.adminUsers || []);
        if (supportList.status === 'fulfilled') setSupportTickets(supportList.value.tickets || []);
      });

      // Defer AI model info to non-blocking background task
      getAiModelInfo()
        .then((aiModelResponse) => setModelInfo(aiModelResponse || null))
        .catch((error) => {
          setModelInfo(null);
          setModelInfoError(
            error?.name === 'TypeError'
              ? 'AI model metadata is unavailable. Check VITE_AI_BASE_URL or the AI service deployment.'
              : (error.message || 'AI model metadata is unavailable.')
          );
        });

      const failedResponses = [f, e, p, adminList, supportList, statsResponse].filter((response) => response.status === 'rejected');
      if (failedResponses.length > 0) {
        const combinedErrorMessage = failedResponses
          .map((response) => response.reason?.message)
          .filter(Boolean)
          .join(' | ');

        if (isAuthSessionError(combinedErrorMessage)) {
          handleSessionExpiry(combinedErrorMessage);
          return;
        }

        {modelInfoError && (
          <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
            {modelInfoError}
          </div>
        )}

        showToast(`Some data failed to load: ${combinedErrorMessage || 'Unknown error.'}`);
      }
    } catch (err) {
      showToast('Failed to load data: ' + err.message);
    }
    finally { setLoading(false); }
  }, [adminAccessToken]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleReview = async (claimId, decision) => {
    setReviewing(r => ({ ...r, [claimId]: true }));
    try {
      await reviewClaim(claimId, { decision, reviewerNotes: note[claimId] || '' }, adminAccessToken);
      showToast(`Claim ${decision === 'approve' ? 'approved ' : 'rejected '}`);
      setFlagged(f => f.filter(c => c._id !== claimId));
    } catch (e) { showToast('Review failed: ' + e.message); }
    finally { setReviewing(r => ({ ...r, [claimId]: false })); }
  };

  const handleWeatherCheck = async () => {
    setWeatherLoading(true); setWeatherResult(null);
    try {
      const r = await triggerWeatherCheck(adminAccessToken);
      setWeatherResult(r);
      showToast(`Weather check done  ${r.totalEventsCreated} new event(s) created`);
      loadData();
    } catch (e) { showToast('Weather check failed: ' + e.message); }
    finally { setWeatherLoading(false); }
  };

  const handleCreateEvent = async () => {
    if (
      newEvent.disruptionType === 'other' &&
      !String(newEvent.customDisruptionTypeLabel || '').trim()
    ) {
      showToast('Please add a custom disruption name for Other type.');
      return;
    }

    setCreating(true);
    try {
      const rainfall = Number(newEvent.measuredRainfallInMillimetres);
      const temperature = Number(newEvent.measuredTemperatureInCelsius);
      const airQuality = Number(newEvent.measuredAirQualityIndex);
      const lpgShortage = Number(newEvent.measuredLpgShortageSeverityIndex);
      const radius = Number(newEvent.affectedRadiusInKilometres);

      if (!Number.isFinite(radius) || radius <= 0) {
        showToast('Please provide a valid affected radius (km).');
        return;
      }

      await createDisruptionEvent({
        ...newEvent,
        measuredRainfallInMillimetres: Number.isFinite(rainfall) ? rainfall : null,
        measuredTemperatureInCelsius: Number.isFinite(temperature) ? temperature : null,
        measuredAirQualityIndex: Number.isFinite(airQuality) ? airQuality : null,
        measuredLpgShortageSeverityIndex: Number.isFinite(lpgShortage) ? lpgShortage : null,
        affectedRadiusInKilometres: radius,
        disruptionStartTimestamp: new Date().toISOString(),
      }, adminAccessToken);
      showToast('Disruption event created ');
      loadData();
    } catch (e) {
      if (isAuthSessionError(e.message)) {
        handleSessionExpiry(e.message);
        return;
      }

      showToast('Failed: ' + e.message);
    }
    finally { setCreating(false); }
  };

  const handleTriggerClaims = async (event) => {
    setTriggeringEventId(event._id);
    try {
      await triggerClaimsForEvent(event._id, {
        minutesActiveOnDeliveryPlatform: 90,
        currentEnvironmentalConditions: {
          rainfallInMillimetres: Number(event.measuredRainfallInMillimetres || 0),
          temperatureInCelsius: Number(event.measuredTemperatureInCelsius || 0),
          airQualityIndex: Number(event.measuredAirQualityIndex || 0),
          lpgShortageSeverityIndex: Number(event.measuredLpgShortageSeverityIndex || 0),
        },
      }, adminAccessToken);
      showToast('Auto-claim trigger completed for event.');
      loadData();
    } catch (error) {
      if (isAuthSessionError(error.message)) {
        handleSessionExpiry(error.message);
        return;
      }

      showToast(`Auto-claim trigger failed: ${error.message}`);
    } finally {
      setTriggeringEventId('');
    }
  };

  const setEvt = (k, v) => setNewEvent(ev => ({ ...ev, [k]: v }));

  const handleAdminLogout = () => {
    if (onAdminLogout) {
      onAdminLogout();
    }
  };

  const handleCreateAdmin = async () => {
    const normalisedFullName = String(newAdmin.fullName || '').trim();
    const normalisedEmailAddress = String(newAdmin.emailAddress || '').trim().toLowerCase();
    const normalisedPassword = String(newAdmin.password || '').trim();

    if (!normalisedFullName || !normalisedEmailAddress || !normalisedPassword) {
      showToast('Please fill full name, email address, and password for new admin.');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalisedEmailAddress)) {
      showToast('Please enter a valid email address for new admin.');
      return;
    }

    if (normalisedPassword.length < 6) {
      showToast('Admin password must be at least 6 characters long.');
      return;
    }

    setCreatingAdmin(true);
    try {
      await addAdminUser({
        fullName: normalisedFullName,
        emailAddress: normalisedEmailAddress,
        password: normalisedPassword,
      }, adminAccessToken);
      showToast('New admin created successfully.');
      setNewAdmin({ fullName: '', emailAddress: '', password: '' });
      const adminList = await listAdminUsers(adminAccessToken);
      setAdminUsers(adminList.adminUsers || []);
    } catch (error) {
      if (isAuthSessionError(error.message)) {
        handleSessionExpiry(error.message);
        return;
      }

      showToast(`Failed to create admin: ${error.message}`);
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleSeedDemoFlow = async () => {
    setSeedingDemo(true);
    try {
      const response = await seedDemoData({ city: newEvent.affectedCityName }, adminAccessToken);
      const demoInfo = response?.demo || {};
      showToast(`Demo seeded: partner ${demoInfo.partnerId}, claim ${demoInfo.claimId}`);
      await loadData();
    } catch (error) {
      if (isAuthSessionError(error.message)) {
        handleSessionExpiry(error.message);
        return;
      }
      showToast(`Demo seeding failed: ${error.message}`);
    } finally {
      setSeedingDemo(false);
    }
  };

  const handleRemovePartner = async (partnerId) => {
    const targetPartner = partners.find((partner) => partner._id === partnerId);
    const partnerLabel = targetPartner?.fullName || targetPartner?.emailAddress || 'this partner';
    const shouldProceed = window.confirm(`Remove ${partnerLabel}? This action cannot be undone.`);
    if (!shouldProceed) {
      return;
    }

    setRemovingPartnerId(partnerId);
    try {
      await removePartner(partnerId, adminAccessToken);
      showToast('Partner removed successfully.');
      setPartners((previousPartners) => previousPartners.filter((partner) => partner._id !== partnerId));
    } catch (error) {
      if (isAuthSessionError(error.message)) {
        handleSessionExpiry(error.message);
        return;
      }

      showToast(`Failed to remove partner: ${error.message}`);
    } finally {
      setRemovingPartnerId('');
    }
  };
  const stats = [
    { icon: <StatLogo type="claims" />, cls: 'stat-icon-indigo', label: 'Flagged Claims',   value: flagged.length },
    { icon: <StatLogo type="events" />, cls: 'stat-icon-amber',  label: 'Active Events',    value: events.filter(e => !e.hasAutomaticClaimTriggerBeenFired).length },
    { icon: <StatLogo type="partners" />, cls: 'stat-icon-sky',    label: 'Total Partners',   value: partners.length },
    { icon: <StatLogo type="verified" />, cls: 'stat-icon-emerald',label: 'Verified Partners', value: partners.filter(p => p.isAccountVerified).length },
  ];

  const TABS = [
    { id: 'claims',  label: `Flagged Claims (${flagged.length})` },
    { id: 'events',  label: `Disruption Events (${events.length})` },
    { id: 'partners', label: `Partners (${partners.length})` },
    { id: 'support', label: `Support (${supportTickets.length})` },
    { id: 'weather', label: ' Weather Monitor' },
    { id: 'admins', label: `Admins (${adminUsers.length})` },
  ];

  const filteredSupportTickets = supportTickets.filter((ticket) => {
    const statusMatches = supportFilters.status === 'all' || ticket.ticketStatus === supportFilters.status;
    const categoryMatches = supportFilters.category === 'all' || ticket.issueCategory === supportFilters.category;
    return statusMatches && categoryMatches;
  });

  return (
    <div className="page">
      {toast && (
        <div style={{
          position: 'fixed', top: 80, right: 20, zIndex: 9999,
          background: 'var(--bg-secondary)', border: '1px solid var(--border-accent)',
          borderRadius: 10, padding: '0.75rem 1.25rem', fontSize: '0.88rem',
          boxShadow: 'var(--shadow)', animation: 'slideUp 0.2s ease',
        }}>{toast}</div>
      )}

      <div className="page-header">
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="page-title">Admin Panel</div>
              <div className="page-sub">Manage claims, events and weather monitoring</div>
              {adminProfile?.emailAddress && (
                <div className="page-sub" style={{ marginTop: '0.2rem' }}>
                  Signed in as {adminProfile.emailAddress}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading}>
                {loading ? '' : ' Refresh'}
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleAdminLogout}>
                Logout Admin
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '2rem' }}>
        {/* Stats */}
        <div className="stats-grid" style={{ marginBottom: '2rem' }}>
          {stats.map(s => (
            <div className="card card-sm stat-card" key={s.label}>
              <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
              <div className="stat-value">{loading ? '' : s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {adminStats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: '0.8rem' }}>Weekly Payout Trend</div>
              <MiniBarChart
                data={adminStats.weeklyPayoutTrend || []}
                valueKey="payout"
                labelKey="label"
                barColor="#10b981"
              />
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: '0.8rem' }}>Claims by Status</div>
              <MiniBarChart
                data={Object.entries(adminStats.claimsByStatus || {}).map(([label, value]) => ({
                  label: label.replace(/_/g, ' '),
                  value,
                }))}
                valueKey="value"
                labelKey="label"
                barColor="#38bdf8"
              />
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div style={{ fontWeight: 700 }}>Risk & Revenue Snapshot</div>
              <DonutMetric
                label="Flagged Claims"
                value={adminStats.flaggedClaimsCount}
                max={Math.max(1, adminStats.totalClaims)}
                color="#f59e0b"
              />
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Estimated weekly earnings: {formatInr(adminStats.earningsVsPayout?.estimatedWeeklyPartnerEarnings || 0)}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Total payout issued: {formatInr(adminStats.earningsVsPayout?.totalPayoutIssued || 0)}
              </div>
              <button className="btn btn-primary" onClick={handleSeedDemoFlow} disabled={seedingDemo}>
                {seedingDemo ? 'Seeding Demo...' : 'One-Click Demo Seeder'}
              </button>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: '0.8rem' }}>Claims Per Day (Last 7 Days)</div>
              <MiniLineChart
                data={adminStats.claimsPerDay || []}
                valueKey="totalClaims"
                labelKey="label"
                stroke="#38bdf8"
              />
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: '0.8rem' }}>Approved vs Flagged vs Rejected</div>
              <ClaimsSplitPie claimsByStatus={adminStats.claimsByStatus || {}} />
            </div>
          </div>
        )}

        {adminStats?.cityRiskHeatmap?.length > 0 && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.8rem' }}>City-Wise Risk Heatmap</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>City</th>
                    <th>Partners</th>
                    <th>Events This Week</th>
                    <th>Intensity</th>
                    <th>Risk Band</th>
                  </tr>
                </thead>
                <tbody>
                  {adminStats.cityRiskHeatmap.map((row) => (
                    <tr key={row.cityName}>
                      <td>{row.cityName}</td>
                      <td>{row.totalPartners}</td>
                      <td>{row.eventsThisWeek}</td>
                      <td>{row.disruptionIntensity}</td>
                      <td>
                        <span className={`badge ${row.riskBand === 'high' ? 'badge-rejected' : row.riskBand === 'moderate' ? 'badge-pending' : 'badge-approved'}`}>
                          <span className="badge-dot" />
                          {row.riskBand}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DisruptionMap
          events={events.slice(0, 25)}
          partnerCoordinates={partners?.[0]?.primaryDeliveryZoneCoordinates}
        />

        {modelInfo?.modelMetadata && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Fraud Model Info</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                Service: <strong style={{ color: 'var(--text-primary)' }}>RakshaRide AI</strong>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                Trained At: <strong style={{ color: 'var(--text-primary)' }}>{modelInfo.modelMetadata.trained_at || 'n/a'}</strong>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                Fraud Accuracy: <strong style={{ color: 'var(--text-primary)' }}>{modelInfo.modelMetadata.fraud_classifier_accuracy || 'n/a'}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '0.6rem 1.1rem', background: 'none', border: 'none',
              fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
              color: tab === t.id ? 'var(--amber)' : 'var(--text-secondary)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--amber)' : 'transparent'}`,
              marginBottom: '-1px', transition: 'var(--transition)',
            }}>{t.label}</button>
          ))}
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="skeleton-grid">
              {[1, 2, 3, 4].map((item) => (
                <div className="skeleton-card" key={`admin-s-${item}`}>
                  <div className="skeleton-line" style={{ width: '45%', marginBottom: '0.7rem' }} />
                  <div className="skeleton-line" style={{ width: '70%', height: 18 }} />
                </div>
              ))}
            </div>
            <div className="skeleton-card">
              <div className="skeleton-line" style={{ width: '35%', marginBottom: '0.8rem' }} />
              <div className="skeleton-line" style={{ width: '100%', height: 180 }} />
            </div>
          </div>
        )}

        {/*  Flagged Claims  */}
        {!loading && tab === 'claims' && (
          flagged.length === 0
            ? (
              <div className="empty-state">
                <div className="empty-icon"></div>
                <div className="empty-title">No flagged claims</div>
                <div className="empty-sub">All claims have been reviewed or auto-approved.</div>
              </div>
            )
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {flagged.map(claim => {
                  const score = claim.fraudRiskScoreAtTimeOfClaim ?? 0;
                  const details = (() => { try { return JSON.parse(claim.fraudReviewNotes || '{}'); } catch { return {}; } })();
                  return (
                    <div className="card" key={claim._id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                            {claim.deliveryPartnerId?.fullName || 'Unknown Partner'}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {claim.deliveryPartnerId?.emailAddress}  {claim.deliveryPartnerId?.primaryDeliveryCity}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                            {humanizeDisruptionType(claim.triggeringDisruptionEventId?.disruptionType)}  {claim.triggeringDisruptionEventId?.affectedCityName} {' '}
                            {new Date(claim.claimSubmissionTimestamp).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Fraud Score</div>
                            <div className={`fraud-score ${score < 0.4 ? 'fraud-low' : score < 0.7 ? 'fraud-mid' : 'fraud-high'}`}>
                              {(score * 100).toFixed(0)}%
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Requested</div>
                            <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{formatInr(claim.requestedCompensationAmountInRupees)}</div>
                          </div>
                        </div>
                      </div>

                      {/* Fraud flags */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                        {details.isLocationConsistent === false && <span className="badge badge-rejected"><span className="badge-dot" /> Location mismatch</span>}
                        {details.wasPartnerActiveOnPlatform === false && <span className="badge badge-rejected"><span className="badge-dot" /> Low platform activity</span>}
                        {details.hasExceededWeeklyClaimLimit && <span className="badge badge-rejected"><span className="badge-dot" /> Weekly limit exceeded</span>}
                        {details.locationDiscrepancyInKilometres != null && (
                          <span className="badge badge-info"><span className="badge-dot" /> Discrepancy: {details.locationDiscrepancyInKilometres?.toFixed(2)} km</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                          <label className="form-label">Reviewer Notes</label>
                          <input className="form-input" placeholder="Optional notes"
                            value={note[claim._id] || ''} onChange={e => setNote(n => ({ ...n, [claim._id]: e.target.value }))} />
                        </div>
                        <button className="btn btn-success" onClick={() => handleReview(claim._id, 'approve')} disabled={reviewing[claim._id]}>
                          {reviewing[claim._id] ? '' : ' Approve'}
                        </button>
                        <button className="btn btn-danger" onClick={() => handleReview(claim._id, 'reject')} disabled={reviewing[claim._id]}>
                          {reviewing[claim._id] ? '' : ' Reject'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
        )}

        {/*  Disruption Events  */}
        {!loading && tab === 'events' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Create event */}
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: '1rem' }}>Create Disruption Event</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={newEvent.disruptionType} onChange={e => setEvt('disruptionType', e.target.value)}>
                    {DISRUPTION_TYPE_OPTIONS.map((typeOption) => (
                      <option key={typeOption.value} value={typeOption.value}>{typeOption.label}</option>
                    ))}
                  </select>
                </div>
                {newEvent.disruptionType === 'other' && (
                  <div className="form-group">
                    <label className="form-label">Custom Type Name</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="e.g. political_strike"
                      value={newEvent.customDisruptionTypeLabel}
                      onChange={e => setEvt('customDisruptionTypeLabel', e.target.value)}
                    />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">City</label>
                  <select className="form-select" value={newEvent.affectedCityName}
                    onChange={e => { setEvt('affectedCityName', e.target.value); setEvt('affectedZoneCentreCoordinates', CITY_COORDS[e.target.value] || { latitude: 13.08, longitude: 80.27 }); }}>
                    {Object.keys(CITY_COORDS).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Rainfall (mm)</label>
                  <input className="form-input" type="number" value={newEvent.measuredRainfallInMillimetres} onChange={e => setEvt('measuredRainfallInMillimetres', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Temp (C)</label>
                  <input className="form-input" type="number" value={newEvent.measuredTemperatureInCelsius} onChange={e => setEvt('measuredTemperatureInCelsius', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">AQI</label>
                  <input className="form-input" type="number" value={newEvent.measuredAirQualityIndex} onChange={e => setEvt('measuredAirQualityIndex', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">LPG Shortage Index</label>
                  <input className="form-input" type="number" value={newEvent.measuredLpgShortageSeverityIndex} onChange={e => setEvt('measuredLpgShortageSeverityIndex', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Radius (km)</label>
                  <input className="form-input" type="number" value={newEvent.affectedRadiusInKilometres} onChange={e => setEvt('affectedRadiusInKilometres', e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleCreateEvent} disabled={creating}>
                {creating ? <><span className="spinner spinner-sm" /> Creating</> : '+ Create Event'}
              </button>
            </div>

            {/* Events list */}
            {events.length === 0
              ? <div className="empty-state"><div className="empty-icon"></div><div className="empty-title">No disruption events</div></div>
              : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>City</th>
                        <th>Measurements</th>
                        <th>Partners</th>
                        <th>Triggered</th>
                        <th>Auto Claim</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map(ev => (
                        <tr key={ev._id}>
                          <td>
                            {ev.disruptionType === 'other' && ev.customDisruptionTypeLabel
                              ? ev.customDisruptionTypeLabel
                              : humanizeDisruptionType(ev.disruptionType)}
                          </td>
                          <td>{ev.affectedCityName}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {ev.measuredRainfallInMillimetres != null && ` ${ev.measuredRainfallInMillimetres}mm `}
                            {ev.measuredTemperatureInCelsius != null && ` ${ev.measuredTemperatureInCelsius}C `}
                            {ev.measuredAirQualityIndex != null && ` AQI ${ev.measuredAirQualityIndex} `}
                            {ev.measuredLpgShortageSeverityIndex != null && ` LPG ${ev.measuredLpgShortageSeverityIndex}`}
                          </td>
                          <td>{ev.numberOfAffectedDeliveryPartners || 0}</td>
                          <td>
                            <span className={`badge ${ev.hasAutomaticClaimTriggerBeenFired ? 'badge-approved' : 'badge-pending'}`}>
                              <span className="badge-dot" />
                              {ev.hasAutomaticClaimTriggerBeenFired ? 'Yes' : 'Pending'}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleTriggerClaims(ev)}
                              disabled={ev.hasAutomaticClaimTriggerBeenFired || triggeringEventId === ev._id}
                            >
                              {triggeringEventId === ev._id
                                ? 'Triggering...'
                                : ev.hasAutomaticClaimTriggerBeenFired
                                  ? 'Done'
                                  : 'Run'}
                            </button>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {new Date(ev.disruptionStartTimestamp).toLocaleDateString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        )}

        {/*  Weather Monitor  */}
        {!loading && tab === 'weather' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 640 }}>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Auto-Weather Monitoring</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.7 }}>
                RakshaRide automatically polls OpenWeatherMap every <strong>30 minutes</strong> for
                8 Indian cities. When rainfall exceeds 50 mm, temperature exceeds 42C, or AQI
                exceeds 300, a disruption event is created automatically. Additional mock triggers
                (LPG shortage, curfew, flooding) can be created from the Events tab.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {Object.keys(CITY_COORDS).map(c => (
                  <span key={c} className="badge badge-info"><span className="badge-dot" />{c}</span>
                ))}
              </div>
              <button className="btn btn-primary" onClick={handleWeatherCheck} disabled={weatherLoading}>
                {weatherLoading ? <><span className="spinner spinner-sm" /> Checking all cities</> : ' Run Weather Check Now'}
              </button>
            </div>

            {weatherResult && (
              <div className="card animate-slide-up">
                <div style={{ fontWeight: 700, marginBottom: '1rem' }}>
                  Last Check  {new Date(weatherResult.checkedAt).toLocaleTimeString('en-IN')}
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ flex: 1, textAlign: 'center', padding: '0.75rem', background: 'rgba(245,158,11,0.06)', borderRadius: 10 }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--amber)' }}>{weatherResult.totalEventsCreated}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Events created</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {weatherResult.cityResults?.map(r => (
                    <div key={r.city} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.5rem 0.75rem', borderRadius: 8,
                      background: r.eventsCreated?.length > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                    }}>
                      <span style={{ fontSize: '0.875rem' }}>{r.city}</span>
                      {r.error
                        ? <span style={{ fontSize: '0.78rem', color: 'var(--red)' }}>Error</span>
                        : r.eventsCreated?.length > 0
                          ? <span style={{ fontSize: '0.78rem', color: 'var(--red)', fontWeight: 700 }}> {r.eventsCreated.join(', ')}</span>
                          : <span style={{ fontSize: '0.78rem', color: 'var(--emerald)' }}> Normal</span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'partners' && (
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: '1rem' }}>Registered Partners</div>
            {partners.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No partners found.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>City</th>
                      <th>Platforms</th>
                      <th>Verified</th>
                      <th>Registered</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partners.map((partner) => (
                      <tr key={partner._id}>
                        <td>{partner.fullName || 'N/A'}</td>
                        <td>{partner.emailAddress || 'N/A'}</td>
                        <td>{partner.mobilePhoneNumber || 'N/A'}</td>
                        <td>{partner.primaryDeliveryCity || 'N/A'}</td>
                        <td>{Array.isArray(partner.deliveryPlatformNames) ? partner.deliveryPlatformNames.join(', ') : 'N/A'}</td>
                        <td>
                          <span className={`badge ${partner.isAccountVerified ? 'badge-approved' : 'badge-pending'}`}>
                            <span className="badge-dot" />
                            {partner.isAccountVerified ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td>{partner.accountRegistrationDate ? new Date(partner.accountRegistrationDate).toLocaleDateString('en-IN') : 'N/A'}</td>
                        <td>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRemovePartner(partner._id)}
                            disabled={removingPartnerId === partner._id}
                          >
                            {removingPartnerId === partner._id ? 'Removing...' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'support' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div style={{ fontWeight: 700 }}>Customer Support Tickets</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Requests submitted from the public support form and stored in MongoDB.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={supportFilters.status}
                    onChange={(event) => setSupportFilters((previousFilters) => ({
                      ...previousFilters,
                      status: event.target.value,
                    }))}
                  >
                    {SUPPORT_STATUS_OPTIONS.map((statusOption) => (
                      <option key={statusOption.value} value={statusOption.value}>{statusOption.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={supportFilters.category}
                    onChange={(event) => setSupportFilters((previousFilters) => ({
                      ...previousFilters,
                      category: event.target.value,
                    }))}
                  >
                    {SUPPORT_CATEGORY_OPTIONS.map((categoryOption) => (
                      <option key={categoryOption.value} value={categoryOption.value}>{categoryOption.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={loadData}>
                    Refresh Tickets
                  </button>
                </div>
              </div>
            </div>

            {filteredSupportTickets.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"></div>
                <div className="empty-title">No support tickets found</div>
                <div className="empty-sub">Try changing filters or refresh ticket data.</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Requester</th>
                      <th>Contact</th>
                      <th>Category</th>
                      <th>Subject</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSupportTickets.map((ticket) => (
                      <tr key={ticket._id}>
                        <td>
                          <div className="td-name">{ticket.fullName || 'N/A'}</div>
                          <div className="td-sub">{ticket.deliveryPartnerId?._id ? `Partner: ${ticket.deliveryPartnerId._id}` : 'Guest request'}</div>
                        </td>
                        <td>
                          <div>{ticket.emailAddress || 'N/A'}</div>
                          <div className="td-sub">{ticket.mobilePhoneNumber || 'No phone'}</div>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{SUPPORT_CATEGORY_VALUE_TO_LABEL[ticket.issueCategory] || String(ticket.issueCategory || 'general').replace(/_/g, ' ')}</td>
                        <td>
                          <div className="td-name">{ticket.subject || 'No subject'}</div>
                          <div className="td-sub" style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ticket.message || 'No message'}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${ticket.ticketStatus === 'resolved' || ticket.ticketStatus === 'closed' ? 'badge-approved' : ticket.ticketStatus === 'in_progress' ? 'badge-active' : 'badge-pending'}`}>
                            <span className="badge-dot" />
                            {SUPPORT_STATUS_VALUE_TO_LABEL[ticket.ticketStatus] || String(ticket.ticketStatus || 'open').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('en-IN') : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'admins' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: '1rem' }}>Add Admin</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    className="form-input"
                    type="text"
                    value={newAdmin.fullName}
                    onChange={(e) => setNewAdmin((prev) => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Admin full name"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    className="form-input"
                    type="email"
                    value={newAdmin.emailAddress}
                    onChange={(e) => setNewAdmin((prev) => ({ ...prev, emailAddress: e.target.value }))}
                    placeholder="admin@example.com"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    className="form-input"
                    type="password"
                    value={newAdmin.password}
                    onChange={(e) => setNewAdmin((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="At least 6 characters"
                  />
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleCreateAdmin} disabled={creatingAdmin}>
                {creatingAdmin ? 'Creating Admin...' : 'Add Admin'}
              </button>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: '1rem' }}>Existing Admin Users</div>
              {adminUsers.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No admin users found.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.map((adminUser) => (
                        <tr key={adminUser._id || adminUser.emailAddress}>
                          <td>{adminUser.fullName || 'N/A'}</td>
                          <td>{adminUser.emailAddress}</td>
                          <td>{new Date(adminUser.createdAt).toLocaleDateString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
