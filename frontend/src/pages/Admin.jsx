import React, { useState, useEffect, useCallback } from 'react';
import {
  getFlaggedClaims, reviewClaim, listDisruptionEvents,
  triggerWeatherCheck, createDisruptionEvent, listPartners, triggerClaimsForEvent,
  addAdminUser, listAdminUsers,
} from '../api/rakshaRideApi';
import StatusBadge from '../components/StatusBadge';

export default function Admin({ adminAccessToken, adminProfile, onAdminLogout }) {
  const DISRUPTION_TYPE_OPTIONS = [
    'heavy_rainfall',
    'extreme_heat',
    'hazardous_air_quality',
    'lpg_shortage',
    'area_curfew',
    'flooding',
    'cyclone_alert',
    'thunderstorm',
    'waterlogging',
    'road_blockage',
    'other',
  ];

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
  const [adminUsers, setAdminUsers] = useState([]);
  const [newAdmin, setNewAdmin] = useState({ fullName: '', emailAddress: '', password: '' });
  const [creatingAdmin, setCreatingAdmin] = useState(false);

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
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, e, p, adminList] = await Promise.allSettled([
        getFlaggedClaims({ limit: 50 }, adminAccessToken),
        listDisruptionEvents({ limit: 30 }),
        listPartners({ limit: 100 }),
        listAdminUsers(adminAccessToken),
      ]);

      if (f.status === 'fulfilled') {
        setFlagged(f.value.flaggedClaims || []);
      }
      if (e.status === 'fulfilled') {
        setEvents(e.value.disruptionEvents || []);
      }
      if (p.status === 'fulfilled') {
        setPartners(p.value.deliveryPartners || []);
      }
      if (adminList.status === 'fulfilled') {
        setAdminUsers(adminList.value.adminUsers || []);
      }

      const failedResponses = [f, e, p, adminList].filter((response) => response.status === 'rejected');
      if (failedResponses.length > 0) {
        const combinedErrorMessage = failedResponses
          .map((response) => response.reason?.message)
          .filter(Boolean)
          .join(' | ');

        if (isAuthSessionError(combinedErrorMessage)) {
          handleSessionExpiry(combinedErrorMessage);
          return;
        }

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
  const stats = [
    { icon: '', cls: 'stat-icon-indigo', label: 'Flagged Claims',   value: flagged.length },
    { icon: '', cls: 'stat-icon-amber',  label: 'Active Events',    value: events.filter(e => !e.hasAutomaticClaimTriggerBeenFired).length },
    { icon: '', cls: 'stat-icon-sky',    label: 'Total Partners',   value: partners.length },
    { icon: '', cls: 'stat-icon-emerald',label: 'Verified Partners', value: partners.filter(p => p.isAccountVerified).length },
  ];

  const TABS = [
    { id: 'claims',  label: `Flagged Claims (${flagged.length})` },
    { id: 'events',  label: `Disruption Events (${events.length})` },
    { id: 'weather', label: ' Weather Monitor' },
    { id: 'admins', label: `Admins (${adminUsers.length})` },
  ];

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

        {loading && <div className="loading-full"><div className="spinner" /></div>}

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
                            {claim.triggeringDisruptionEventId?.disruptionType?.replace(/_/g, ' ')}  {claim.triggeringDisruptionEventId?.affectedCityName} {' '}
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
                            <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{claim.requestedCompensationAmountInRupees}</div>
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
                    {DISRUPTION_TYPE_OPTIONS.map(t => (
                      <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
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
                              ? <StatusBadge status={ev.customDisruptionTypeLabel} />
                              : <StatusBadge status={ev.disruptionType} />}
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
                {['Chennai','Mumbai','Delhi','Bengaluru','Hyderabad','Kolkata','Pune','Ahmedabad'].map(c => (
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
                          <td>{adminUser.fullName}</td>
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

