import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPartner, getPartnerClaims, submitClaim, listDisruptionEvents } from '../api/rakshaRideApi';
import StatusBadge from '../components/StatusBadge';

function ProgressBar({ value, max, color = 'amber' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="progress-wrap">
      <div className={`progress-fill progress-${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ClaimModal({ partner, policy, events, onClose, onSuccess }) {
  const [form, setForm] = useState({
    triggeringDisruptionEventId: '',
    rainfallInMillimetres: 85,
    temperatureInCelsius: 30,
    airQualityIndex: 120,
    minutesActiveOnDeliveryPlatform: 90,
    accountHolderName: partner?.fullName || '',
    accountNumber: '',
    ifscCode: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.triggeringDisruptionEventId) { setError('Select a disruption event.'); return; }
    setError(''); setLoading(true);
    try {
      const coords = policy?.deliveryPartnerId?.primaryDeliveryZoneCoordinates ||
        partner?.primaryDeliveryZoneCoordinates ||
        { latitude: 13.08, longitude: 80.27 };

      const res = await submitClaim({
        deliveryPartnerId: partner._id || partner.partnerId,
        triggeringDisruptionEventId: form.triggeringDisruptionEventId,
        currentEnvironmentalConditions: {
          rainfallInMillimetres: Number(form.rainfallInMillimetres),
          temperatureInCelsius:  Number(form.temperatureInCelsius),
          airQualityIndex:       Number(form.airQualityIndex),
        },
        partnerLocationAtDisruptionTime: coords,
        networkSignalCoordinates: coords,
        minutesActiveOnDeliveryPlatform: Number(form.minutesActiveOnDeliveryPlatform),
        beneficiaryBankDetails: {
          accountHolderName: form.accountHolderName,
          accountNumber: form.accountNumber,
          ifscCode: form.ifscCode,
        },
      });
      onSuccess(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up">
        <div className="modal-title">Submit Insurance Claim</div>
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {events.length === 0 && (
            <div className="alert alert-warning" style={{ marginBottom: '0.4rem' }}>
              No disruption events available yet. Ask admin to create an event first.
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Disruption Event</label>
            <select className="form-select" value={form.triggeringDisruptionEventId}
              onChange={e => set('triggeringDisruptionEventId', e.target.value)}>
              <option value=""> Select event </option>
              {events.map(ev => (
                <option key={ev._id} value={ev._id}>
                  {ev.disruptionType.replace(/_/g, ' ')}  {ev.affectedCityName} ({new Date(ev.disruptionStartTimestamp).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Environmental Conditions</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Rainfall (mm)</label>
              <input className="form-input" type="number" value={form.rainfallInMillimetres} onChange={e => set('rainfallInMillimetres', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Temp (C)</label>
              <input className="form-input" type="number" value={form.temperatureInCelsius} onChange={e => set('temperatureInCelsius', e.target.value)} />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">AQI</label>
              <input className="form-input" type="number" value={form.airQualityIndex} onChange={e => set('airQualityIndex', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Active Minutes</label>
              <input className="form-input" type="number" value={form.minutesActiveOnDeliveryPlatform} onChange={e => set('minutesActiveOnDeliveryPlatform', e.target.value)} />
            </div>
          </div>

          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Bank Details (for payout)</div>
          <div className="form-group">
            <label className="form-label">Account Holder Name</label>
            <input className="form-input" value={form.accountHolderName} onChange={e => set('accountHolderName', e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Account Number</label>
              <input className="form-input" placeholder="1234567890" value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">IFSC Code</label>
              <input className="form-input" placeholder="SBIN0001234" value={form.ifscCode} onChange={e => set('ifscCode', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? <><span className="spinner spinner-sm" /> Processing</> : 'Submit Claim'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ authenticatedPartnerId = '', authenticatedPartnerProfile = null, onPartnerLogout = null }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialPartnerId = authenticatedPartnerId || searchParams.get('id') || '';
  const [partnerId, setPartnerId] = useState(initialPartnerId);
  const [inputId,   setInputId]   = useState(initialPartnerId);
  const [partner,   setPartner]   = useState(null);
  const [claims,    setClaims]    = useState([]);
  const [events,    setEvents]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [showModal, setShowModal] = useState(false);
  const [claimResult, setClaimResult] = useState(null);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true); setError(''); setPartner(null); setClaims([]);
    try {
      const [partRes, claimRes, eventsRes] = await Promise.all([
        getPartner(id),
        getPartnerClaims(id, { limit: 50 }),
        listDisruptionEvents({ limit: 20 }),
      ]);
      setPartner(partRes.deliveryPartner);
      setClaims(claimRes.claims || []);
      setEvents(eventsRes.disruptionEvents || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (partnerId) load(partnerId); }, [partnerId, load]);

  useEffect(() => {
    if (authenticatedPartnerId && authenticatedPartnerId !== partnerId) {
      setPartnerId(authenticatedPartnerId);
      setInputId(authenticatedPartnerId);
      navigate(`/dashboard?id=${authenticatedPartnerId}`, { replace: true });
    }
  }, [authenticatedPartnerId, navigate, partnerId]);

  const handleSearch = () => {
    if (!inputId.trim()) return;
    setPartnerId(inputId.trim());
    navigate(`/dashboard?id=${inputId.trim()}`, { replace: true });
  };

  const handleClaimSuccess = (res) => {
    setClaimResult(res);
    setShowModal(false);
    load(partnerId);
  };

  const policy = partner?.activeInsurancePolicyId;
  const totalCompensation = partner?.totalCompensationReceivedInRupees || 0;
  const approvedClaims = claims.filter(c => ['approved_for_payout','payout_processed'].includes(c.currentClaimStatus)).length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div className="page-title">My Dashboard</div>
              <div className="page-sub">
                Track your policy, claims and payouts
                {authenticatedPartnerProfile?.emailAddress ? ` | ${authenticatedPartnerProfile.emailAddress}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {partner && (
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                  + Submit Claim
                </button>
              )}
              {onPartnerLogout && (
                <button className="btn btn-secondary" onClick={onPartnerLogout}>
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: '2rem' }}>

        {/* Search */}
        {!partner && !loading && (
          <div style={{ maxWidth: 480, margin: '3rem auto', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
            <h2 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Find Your Profile</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Enter your Partner ID received after registration.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input className="form-input" placeholder="Enter Partner ID"
                value={inputId} onChange={e => setInputId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={handleSearch}>Search</button>
            </div>
            {error && <div className="alert alert-error" style={{ marginTop: '1rem', textAlign: 'left' }}>{error}</div>}
          </div>
        )}

        {loading && <div className="loading-full"><div className="spinner" /></div>}

        {partner && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-slide-up">

            {claimResult && (
              <div className={`alert ${claimResult.wasAutoApproved ? 'alert-success' : 'alert-warning'}`}>
                {claimResult.wasAutoApproved
                  ? ` Claim approved! Payout of ${claimResult.claim?.approvedPayoutAmountInRupees || ''} initiated.`
                  : ' Claim submitted and flagged for manual review.'}
              </div>
            )}

            {/* Search bar (compact) */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input className="form-input" value={inputId} onChange={e => setInputId(e.target.value)}
                placeholder="Partner ID" style={{ maxWidth: 320 }} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              <button className="btn btn-secondary btn-sm" onClick={handleSearch}>Load</button>
            </div>

            {/* Partner info */}
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--amber), var(--amber-dark))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: '1.3rem', color: '#0a0e1a', flexShrink: 0,
              }}>
                {partner.fullName?.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{partner.fullName}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {partner.emailAddress}  {partner.primaryDeliveryCity}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  {partner.deliveryPlatformNames?.map(p => (
                    <span key={p} className="badge badge-info" style={{ textTransform: 'capitalize' }}>{p}</span>
                  ))}
                  <span className={`badge ${partner.isAccountVerified ? 'badge-approved' : 'badge-pending'}`}>
                    <span className="badge-dot" />
                    {partner.isAccountVerified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Total Received</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--emerald)' }}>{totalCompensation.toLocaleString('en-IN')}</div>
              </div>
            </div>

            {/* Stats */}
            <div className="stats-grid">
              {[
                { icon: '', cls: 'stat-icon-amber',   label: 'Total Claims',     value: claims.length },
                { icon: '', cls: 'stat-icon-emerald',  label: 'Approved',         value: approvedClaims },
                { icon: '', cls: 'stat-icon-sky',     label: 'Coverage Left',    value: policy ? `${policy.remainingCoverageInRupees}` : '' },
                { icon: '', cls: 'stat-icon-indigo',  label: 'Policy Expires',   value: policy ? new Date(policy.policyEndDate).toLocaleDateString('en-IN', { day:'numeric', month:'short' }) : 'No policy' },
              ].map(s => (
                <div className="card card-sm stat-card" key={s.label}>
                  <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Policy card */}
            {policy && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700 }}>Active Policy</div>
                  <StatusBadge status={policy.currentPolicyStatus} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  {[
                    ['Plan',        policy.selectedPlanTier ? policy.selectedPlanTier.charAt(0).toUpperCase() + policy.selectedPlanTier.slice(1) : ''],
                    ['Weekly Premium', `${policy.weeklyPremiumChargedInRupees}`],
                    ['Max Coverage',   `${policy.maximumWeeklyCoverageInRupees}`],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{l}</div>
                      <div style={{ fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Coverage remaining</span>
                    <span style={{ fontWeight: 700 }}>{policy.remainingCoverageInRupees} / {policy.maximumWeeklyCoverageInRupees}</span>
                  </div>
                  <ProgressBar
                    value={policy.remainingCoverageInRupees}
                    max={policy.maximumWeeklyCoverageInRupees}
                    color={policy.remainingCoverageInRupees / policy.maximumWeeklyCoverageInRupees > 0.4 ? 'amber' : 'red'}
                  />
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Valid {new Date(policy.policyStartDate).toLocaleDateString('en-IN')}  {new Date(policy.policyEndDate).toLocaleDateString('en-IN')}
                </div>
              </div>
            )}

            {!policy && (
              <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}></div>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No active policy</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Subscribe to a plan to get compensation when disruptions occur.
                </p>
                <button className="btn btn-primary" onClick={() => navigate('/register')}>Subscribe Now</button>
              </div>
            )}

            {/* Claims table */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: '1rem' }}>Claim History ({claims.length})</div>
              {claims.length === 0
                ? (
                  <div className="empty-state">
                    <div className="empty-icon"></div>
                    <div className="empty-title">No claims yet</div>
                    <div className="empty-sub">When a disruption event occurs, you can submit a claim.</div>
                  </div>
                )
                : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Event</th>
                          <th>Status</th>
                          <th>Requested</th>
                          <th>Paid Out</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {claims.map(c => (
                          <tr key={c._id}>
                            <td>
                              <div className="td-name">{c.triggeringDisruptionEventId?.disruptionType?.replace(/_/g, ' ') || ''}</div>
                              <div className="td-sub">{c.triggeringDisruptionEventId?.affectedCityName || ''}</div>
                            </td>
                            <td><StatusBadge status={c.currentClaimStatus} /></td>
                            <td>{c.requestedCompensationAmountInRupees}</td>
                            <td style={{ color: 'var(--emerald)', fontWeight: 700 }}>
                              {c.approvedPayoutAmountInRupees != null ? `${c.approvedPayoutAmountInRupees}` : ''}
                            </td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                              {new Date(c.claimSubmissionTimestamp).toLocaleDateString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          </div>
        )}
      </div>

      {showModal && partner && (
        <ClaimModal
          partner={partner}
          policy={policy}
          events={events}
          onClose={() => setShowModal(false)}
          onSuccess={handleClaimSuccess}
        />
      )}
    </div>
  );
}

