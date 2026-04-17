import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  getPartner,
  getPartnerClaims,
  getPartnerEarningsSummary,
  submitClaim,
  listDisruptionEvents,
  subscribePolicy,
  submitSupportTicket,
  getMySupportTickets,
  createPartnerAlertStream,
} from '../api/rakshaRideApi';
import {
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_STATUS_VALUE_TO_LABEL,
} from '../constants/support';
import StatusBadge from '../components/StatusBadge';
import PayoutModal from '../components/PayoutModal';
import DisruptionMap from '../components/DisruptionMap';
import ClaimTimeline from '../components/ClaimTimeline';
import EarningsTrendChart from '../components/EarningsTrendChart';

function StatLogo({ type = 'claims' }) {
  const iconByType = {
    claims: (
      <path d="M5 6h14M5 10h10M5 14h8M15 14l2 2 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    ),
    approved: (
      <path d="M12 3l7 3v5c0 4.2-2.8 7.1-7 8-4.2-.9-7-3.8-7-8V6l7-3zm-3.2 8.5l2.2 2.2 4.2-4.2" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    ),
    coverage: (
      <path d="M4 12a8 8 0 0116 0M12 12l3-3M12 12v4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    ),
    expiry: (
      <path d="M7 3v3M17 3v3M4 8h16M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2zm4 7h2v4h-2zm4 0h2v4h-2z" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
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

function ProgressBar({ value, max, color = 'amber' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="progress-wrap">
      <div className={`progress-fill progress-${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const formatInr = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;
const humanizeDisruptionType = (type = '') => String(type || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const PARTNER_AUTH_TOKEN_SESSION_STORAGE_KEY = 'raksharide_partner_auth_token';

function extractClaimConfidenceNotes(claimItem) {
  const rawNotes = String(claimItem?.fraudReviewNotes || '').trim();
  if (!rawNotes) {
    return [];
  }

  try {
    const parsedNotes = JSON.parse(rawNotes);
    const anomalyNotes = parsedNotes?.aiAnomalyAssessment?.anomalyDetectionNotes;
    if (Array.isArray(anomalyNotes) && anomalyNotes.length > 0) {
      return anomalyNotes;
    }

    const plainNotes = [];
    if (parsedNotes.isLocationConsistent === false) {
      plainNotes.push('GPS/network location mismatch detected.');
    }
    if (parsedNotes.wasPartnerActiveOnPlatform === false) {
      plainNotes.push('Insufficient delivery activity during disruption window.');
    }
    if (parsedNotes.hasExceededWeeklyClaimLimit) {
      plainNotes.push('Weekly claim frequency is above normal threshold.');
    }

    return plainNotes;
  } catch {
    return [rawNotes];
  }
}

// ── SVG Donut chart for coverage ring ──────────────────────────────────────────
function CoverageDonut({ used = 0, max = 1 }) {
  const R = 48;
  const C = 2 * Math.PI * R;
  const pct = max > 0 ? Math.min(used / max, 1) : 0;
  const remainPct = 1 - pct;
  const usedDash = pct * C;
  const remainDash = remainPct * C;
  const usedColor = pct > 0.8 ? '#ef4444' : pct > 0.5 ? '#f59e0b' : '#10b981';

  return (
    <svg width={120} height={120} viewBox="0 0 120 120">
      <circle cx={60} cy={60} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={14} />
      {/* Remaining (silver) */}
      <circle
        cx={60} cy={60} r={R} fill="none"
        stroke="rgba(255,255,255,0.12)" strokeWidth={14}
        strokeDasharray={`${remainDash} ${C}`}
        strokeDashoffset={-usedDash}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
      />
      {/* Used */}
      <circle
        cx={60} cy={60} r={R} fill="none"
        stroke={usedColor} strokeWidth={14}
        strokeDasharray={`${usedDash} ${C}`}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x={60} y={56} textAnchor="middle" style={{ fill: '#fff', fontSize: 13, fontWeight: 900 }}>
        {Math.round(pct * 100)}%
      </text>
      <text x={60} y={72} textAnchor="middle" style={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }}>
        used
      </text>
    </svg>
  );
}

// ── SVG sparkline of payouts ───────────────────────────────────────────────────
function PayoutSparkline({ claims = [] }) {
  const approved = claims
    .filter(c => ['approved_for_payout', 'payout_processed'].includes(c.currentClaimStatus))
    .slice(-8);

  if (approved.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem 0' }}>No payouts yet</div>;
  }

  const amounts = approved.map(c => c.approvedPayoutAmountInRupees || 0);
  const maxAmt = Math.max(...amounts, 1);
  const W = 240, H = 60, pad = 8;
  const pts = amounts.map((a, i) => {
    const x = pad + (i / Math.max(amounts.length - 1, 1)) * (W - pad * 2);
    const y = H - pad - (a / maxAmt) * (H - pad * 2);
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const area = `M${pts[0]} L${pts.join(' L')} L${pad + (W - pad * 2)},${H} L${pad},${H} Z`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%' }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkGrad)" />
      <polyline points={polyline} fill="none" stroke="#10b981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {amounts.map((a, i) => {
        const [x, y] = pts[i].split(',').map(Number);
        return <circle key={i} cx={x} cy={y} r={3} fill="#10b981" />;
      })}
    </svg>
  );
}

// ── Pulsing coverage status dot ────────────────────────────────────────────────
function CoverageStatusDot({ policy }) {
  if (!policy) return <span style={{ color: 'var(--red)', fontWeight: 700 }}>No Active Policy</span>;
  const daysLeft = Math.ceil((new Date(policy.policyEndDate) - new Date()) / 86400000);
  if (daysLeft <= 0) return <span style={{ color: 'var(--red)', fontWeight: 700 }}>Expired</span>;
  const color = daysLeft <= 3 ? '#f59e0b' : '#10b981';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{
        width: 10, height: 10, borderRadius: '50%', background: color,
        boxShadow: `0 0 0 0 ${color}`,
        animation: 'pulseDot 2s infinite',
        display: 'inline-block',
      }} />
      <span style={{ color, fontWeight: 700 }}>
        {daysLeft <= 3 ? `Expiring in ${daysLeft}d` : `Active — ${daysLeft}d left`}
      </span>
      <style>{`@keyframes pulseDot{0%{box-shadow:0 0 0 0 ${color}88}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}`}</style>
    </span>
  );
}

// ── Claim modal (unchanged logic) ──────────────────────────────────────────────
function ClaimModal({ partner, policy, events, onClose, onSuccess }) {
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

  const [form, setForm] = useState({
    selectedDisruptionType: '',
    customDisruptionTypeLabel: '',
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

  const filteredEvents = events.filter((eventItem) => {
    if (!form.selectedDisruptionType) return true;
    if (form.selectedDisruptionType === 'other') {
      const customTypeQuery = String(form.customDisruptionTypeLabel || '').trim().toLowerCase();
      if (!customTypeQuery) return eventItem.disruptionType === 'other';
      return eventItem.disruptionType === 'other'
        && String(eventItem.customDisruptionTypeLabel || '').toLowerCase().includes(customTypeQuery);
    }
    return eventItem.disruptionType === form.selectedDisruptionType;
  });

  const handleSubmit = async () => {
    if (!form.triggeringDisruptionEventId) { setError('Select a disruption event.'); return; }
    setError(''); setLoading(true);
    try {
      const coords = policy?.deliveryPartnerId?.primaryDeliveryZoneCoordinates ||
        partner?.primaryDeliveryZoneCoordinates || { latitude: 13.08, longitude: 80.27 };

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
            <label className="form-label">Disruption Type</label>
            <select className="form-select" value={form.selectedDisruptionType}
              onChange={e => { set('selectedDisruptionType', e.target.value); set('triggeringDisruptionEventId', ''); if (e.target.value !== 'other') set('customDisruptionTypeLabel', ''); }}>
              <option value="">All event types</option>
              {DISRUPTION_TYPE_OPTIONS.map((typeOption) => (
                <option key={typeOption.value} value={typeOption.value}>{typeOption.label}</option>
              ))}
            </select>
          </div>

          {form.selectedDisruptionType === 'other' && (
            <div className="form-group">
              <label className="form-label">Other Type Name</label>
              <input className="form-input" placeholder="Enter custom type (e.g. protest)" value={form.customDisruptionTypeLabel}
                onChange={e => { set('customDisruptionTypeLabel', e.target.value); set('triggeringDisruptionEventId', ''); }} />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Disruption Event</label>
            <select className="form-select" value={form.triggeringDisruptionEventId}
              onChange={e => set('triggeringDisruptionEventId', e.target.value)}>
              <option value=""> Select event </option>
              {filteredEvents.map(ev => (
                <option key={ev._id} value={ev._id}>
                  {(ev.disruptionType === 'other' && ev.customDisruptionTypeLabel
                    ? ev.customDisruptionTypeLabel
                    : humanizeDisruptionType(ev.disruptionType))}
                  {' '}- {ev.affectedCityName} ({new Date(ev.disruptionStartTimestamp).toLocaleDateString()})
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

// ── City risk profile card ─────────────────────────────────────────────────────
const CITY_FORECAST = {
  Chennai:   { pct: 68, level: 'High',      color: '#ef4444', tip: 'Northeast monsoon season — high cyclone risk.' },
  Mumbai:    { pct: 72, level: 'Very High',  color: '#dc2626', tip: 'Pre-monsoon heat & flooding expected.' },
  Delhi:     { pct: 61, level: 'High',       color: '#ef4444', tip: 'Dust storms and extreme heat alerts likely.' },
  Bengaluru: { pct: 35, level: 'Moderate',   color: '#f59e0b', tip: 'Intermittent rain — low disruption risk.' },
  Hyderabad: { pct: 30, level: 'Low',        color: '#10b981', tip: 'Dry season. Minimal disruption expected.' },
  Kolkata:   { pct: 58, level: 'Moderate',   color: '#f59e0b', tip: 'Pre-cyclone season advisory in effect.' },
  Pune:      { pct: 25, level: 'Low',        color: '#10b981', tip: 'Clear conditions forecast next week.' },
  Ahmedabad: { pct: 22, level: 'Low',        color: '#10b981', tip: 'Hot and dry — heat disruptions possible.' },
  Jaipur:    { pct: 38, level: 'Moderate',   color: '#f59e0b', tip: 'Heat spikes likely in afternoon delivery windows.' },
  Lucknow:   { pct: 42, level: 'Moderate',   color: '#f59e0b', tip: 'Patchy rain and humidity may affect trips.' },
  Surat:     { pct: 45, level: 'Moderate',   color: '#f59e0b', tip: 'Coastal showers can cause short disruptions.' },
  Indore:    { pct: 34, level: 'Low',        color: '#10b981', tip: 'Mostly stable weather expected this week.' },
};

function RiskProfileCard({ city = 'Chennai' }) {
  const forecast = CITY_FORECAST[city] || CITY_FORECAST.Chennai;
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>My City Risk Profile</div>
        <span className="badge badge-info">{city}</span>
      </div>

      {/* Risk bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Next-Week Disruption Probability</span>
          <span style={{ fontWeight: 800, color: forecast.color }}>{forecast.pct}%</span>
        </div>
        <div className="progress-wrap">
          <div style={{ width: `${forecast.pct}%`, height: '100%', background: forecast.color, borderRadius: 99, transition: 'width 0.8s ease' }} />
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        background: `${forecast.color}11`,
        borderRadius: 8, border: `1px solid ${forecast.color}33`,
      }}>
        <span style={{ fontSize: '1rem' }}>
          {forecast.level === 'Low' ? '' : forecast.level === 'Moderate' ? '' : ''}
        </span>
        <div>
          <div style={{ fontWeight: 700, color: forecast.color, fontSize: '0.8rem' }}>{forecast.level} Risk</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{forecast.tip}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span className="badge badge-approved" style={{ cursor: 'default' }}>Add UPI for instant payout</span>
        <span className="badge badge-info" style={{ cursor: 'default' }}>AI-monitored 24/7</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
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
  const [showPayout,  setShowPayout]  = useState(false);
  const [toast, setToast] = useState('');
  const [renewingPolicy, setRenewingPolicy] = useState(false);
  const [selectedRenewPlan, setSelectedRenewPlan] = useState('standard');
  const [earningsTrend, setEarningsTrend] = useState([]);
  const [earningsSummary, setEarningsSummary] = useState(null);
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [supportInfo, setSupportInfo] = useState('');
  const [supportForm, setSupportForm] = useState({
    issueCategory: 'general',
    subject: '',
    message: '',
    mobilePhoneNumber: '',
  });

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true); setError(''); setPartner(null); setClaims([]);
    try {
      const [partRes, claimRes, eventsRes, earningsRes] = await Promise.allSettled([
        getPartner(id),
        getPartnerClaims(id, { limit: 50 }),
        listDisruptionEvents({ limit: 40 }),
        getPartnerEarningsSummary(id),
      ]);
      if (partRes.status !== 'fulfilled') {
        throw new Error(partRes.reason?.message || 'Failed to load partner profile.');
      }

      setPartner(partRes.value.deliveryPartner);
      setClaims(claimRes.status === 'fulfilled' ? (claimRes.value.claims || []) : []);
      setEvents(eventsRes.status === 'fulfilled' ? (eventsRes.value.disruptionEvents || []) : []);
      setEarningsTrend(earningsRes.status === 'fulfilled' ? (earningsRes.value.trend || []) : []);
      setEarningsSummary(earningsRes.status === 'fulfilled' ? (earningsRes.value.summary || null) : null);
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

  useEffect(() => {
    if (!partnerId) {
      return undefined;
    }

    const eventSource = createPartnerAlertStream(partnerId);
    eventSource.addEventListener('claim-alert', (eventMessage) => {
      try {
        const payload = JSON.parse(eventMessage.data || '{}');
        const amountLabel = payload?.payoutAmountInRupees
          ? `₹${Number(payload.payoutAmountInRupees).toLocaleString('en-IN')}`
          : '';
        setToast(amountLabel
          ? `Auto-claim payout processed: ${amountLabel}`
          : (payload.message || 'A claim update has arrived.'));
        load(partnerId);
      } catch {
        setToast('A claim update has arrived.');
        load(partnerId);
      }
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [partnerId, load]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timerId = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timerId);
  }, [toast]);

  useEffect(() => {
    if (!partnerId) {
      return undefined;
    }

    const partnerAccessToken = window.sessionStorage.getItem(PARTNER_AUTH_TOKEN_SESSION_STORAGE_KEY) || '';
    if (!partnerAccessToken) {
      setSupportTickets([]);
      return undefined;
    }

    let isCancelled = false;

    const loadSupportTickets = async () => {
      setSupportLoading(true);
      setSupportError('');

      try {
        const response = await getMySupportTickets({ limit: 10 }, partnerAccessToken);
        if (!isCancelled) {
          setSupportTickets(response.tickets || []);
        }
      } catch (error) {
        if (!isCancelled) {
          setSupportTickets([]);
          setSupportError(error.message || 'Failed to load support tickets.');
        }
      } finally {
        if (!isCancelled) {
          setSupportLoading(false);
        }
      }
    };

    loadSupportTickets();

    return () => {
      isCancelled = true;
    };
  }, [partnerId, claims.length]);

  const handleSupportFormChange = (fieldName, fieldValue) => {
    setSupportForm((previousForm) => ({
      ...previousForm,
      [fieldName]: fieldValue,
    }));
  };

  const handleSupportRequestSubmit = async () => {
    if (!partner) {
      setSupportError('Login first to submit a support request.');
      return;
    }

    if (!String(supportForm.subject || '').trim() || !String(supportForm.message || '').trim()) {
      setSupportError('Subject and message are required.');
      return;
    }

    setSupportSubmitting(true);
    setSupportError('');
    setSupportInfo('');

    try {
      await submitSupportTicket({
        fullName: partner.fullName,
        emailAddress: partner.emailAddress,
        mobilePhoneNumber: supportForm.mobilePhoneNumber || partner.mobilePhoneNumber || '',
        deliveryPartnerId: partner._id || partner.partnerId,
        issueCategory: supportForm.issueCategory,
        subject: supportForm.subject.trim(),
        message: supportForm.message.trim(),
      });

      setSupportInfo('Support request submitted successfully.');
      setSupportForm((previousForm) => ({
        ...previousForm,
        subject: '',
        message: '',
      }));

      const partnerAccessToken = window.sessionStorage.getItem(PARTNER_AUTH_TOKEN_SESSION_STORAGE_KEY) || '';
      if (partnerAccessToken) {
        const response = await getMySupportTickets({ limit: 10 }, partnerAccessToken);
        setSupportTickets(response.tickets || []);
      }
    } catch (error) {
      setSupportError(error.message || 'Failed to submit support request.');
    } finally {
      setSupportSubmitting(false);
    }
  };

  const handleSearch = () => {
    if (!inputId.trim()) return;
    setPartnerId(inputId.trim());
    navigate(`/dashboard?id=${inputId.trim()}`, { replace: true });
  };

  const handleClaimSuccess = (res) => {
    setClaimResult(res);
    setShowModal(false);
    load(partnerId);
    // Show payout modal if auto-approved
    if (res?.wasAutoApproved) {
      setTimeout(() => setShowPayout(true), 400);
    }
  };

  const handleRenewPolicy = async () => {
    if (!partner?._id && !partner?.partnerId) {
      return;
    }

    setRenewingPolicy(true);
    try {
      await subscribePolicy({
        deliveryPartnerId: partner._id || partner.partnerId,
        selectedPlanTier: selectedRenewPlan,
      });
      setToast('Policy renewed successfully. Your new weekly coverage is active.');
      await load(partnerId);
    } catch (renewError) {
      setToast(`Policy renewal failed: ${renewError.message}`);
    } finally {
      setRenewingPolicy(false);
    }
  };

  const policy = partner?.activeInsurancePolicyId;
  const isPolicyExpired = policy ? new Date(policy.policyEndDate) < new Date() : false;
  const policyDaysToExpiry = policy
    ? Math.ceil((new Date(policy.policyEndDate).getTime() - Date.now()) / 86400000)
    : null;
  const shouldShowRenewalCta = !policy || isPolicyExpired || Number(policyDaysToExpiry) <= 2;
  const totalCompensation = partner?.totalCompensationReceivedInRupees || 0;
  const approvedClaims = claims.filter(c => ['approved_for_payout','payout_processed'].includes(c.currentClaimStatus)).length;
  const usedCoverage = policy ? (policy.maximumWeeklyCoverageInRupees - policy.remainingCoverageInRupees) : 0;

  return (
    <div className="page">
      {toast && (
        <div style={{
          position: 'fixed',
          top: 85,
          right: 20,
          zIndex: 9999,
          border: '1px solid var(--border-accent)',
          background: 'var(--bg-secondary)',
          borderRadius: 10,
          padding: '0.75rem 1rem',
          boxShadow: 'var(--shadow)',
          fontSize: '0.86rem',
        }}>
          {toast}
        </div>
      )}

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

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="skeleton-grid">
              {[1, 2, 3, 4].map((item) => (
                <div className="skeleton-card" key={`dash-s-${item}`}>
                  <div className="skeleton-line" style={{ width: '45%', marginBottom: '0.7rem' }} />
                  <div className="skeleton-line" style={{ width: '75%', height: 18 }} />
                </div>
              ))}
            </div>
            <div className="skeleton-card">
              <div className="skeleton-line" style={{ width: '30%', marginBottom: '0.8rem' }} />
              <div className="skeleton-line" style={{ width: '100%', height: 180 }} />
            </div>
          </div>
        )}

        {partner && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-slide-up">

            {/* Claim result non-payout banner */}
            {claimResult && !claimResult.wasAutoApproved && (
              <div className="alert alert-warning">
                Claim submitted and flagged for manual review.
              </div>
            )}

            {/* Compact search bar */}
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
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--emerald)' }}>{formatInr(totalCompensation)}</div>
                <div style={{ marginTop: '0.3rem' }}><CoverageStatusDot policy={policy} /></div>
              </div>
            </div>

            {/* Stats */}
            <div className="stats-grid">
              {[
                { icon: <StatLogo type="claims" />, cls: 'stat-icon-amber',   label: 'Total Claims',     value: claims.length },
                { icon: <StatLogo type="approved" />, cls: 'stat-icon-emerald',  label: 'Approved',         value: approvedClaims },
                { icon: <StatLogo type="coverage" />, cls: 'stat-icon-sky',     label: 'Coverage Left',    value: policy ? formatInr(policy.remainingCoverageInRupees) : '—' },
                { icon: <StatLogo type="expiry" />, cls: 'stat-icon-indigo',  label: 'Policy Expires',   value: policy ? new Date(policy.policyEndDate).toLocaleDateString('en-IN', { day:'numeric', month:'short' }) : 'No policy' },
              ].map(s => (
                <div className="card card-sm stat-card" key={s.label}>
                  <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Coverage donut + sparkline row */}
            {policy && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>

                {/* Coverage ring */}
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: '1rem' }}>Coverage Used This Week</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <CoverageDonut used={usedCoverage} max={policy.maximumWeeklyCoverageInRupees} />
                    <div style={{ flex: 1 }}>
                      {[
                        ['Used', formatInr(usedCoverage), 'var(--emerald)'],
                        ['Remaining', formatInr(policy.remainingCoverageInRupees), 'var(--text-primary)'],
                        ['Max Coverage', formatInr(policy.maximumWeeklyCoverageInRupees), 'var(--text-muted)'],
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ marginBottom: '0.4rem' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{l}</div>
                          <div style={{ fontWeight: 700, color: c }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Payout sparkline */}
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: '1rem' }}>Recent Payouts</div>
                  <PayoutSparkline claims={claims} />
                  {approvedClaims > 0 && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {approvedClaims} claim{approvedClaims !== 1 ? 's' : ''} paid out — total {formatInr(totalCompensation)}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Active policy card */}
            {policy && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700 }}>Active Policy</div>
                  <StatusBadge status={policy.currentPolicyStatus} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  {[
                    ['Plan', policy.selectedPlanTier ? policy.selectedPlanTier.charAt(0).toUpperCase() + policy.selectedPlanTier.slice(1) : ''],
                    ['Weekly Premium', formatInr(policy.weeklyPremiumChargedInRupees)],
                    ['Max Coverage',   formatInr(policy.maximumWeeklyCoverageInRupees)],
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
                    <span style={{ fontWeight: 700 }}>{formatInr(policy.remainingCoverageInRupees)} / {formatInr(policy.maximumWeeklyCoverageInRupees)}</span>
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

            {shouldShowRenewalCta && (
              <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>
                  {!policy
                    ? 'No active policy'
                    : isPolicyExpired
                      ? 'Policy expired, renew now'
                      : `Policy expiring in ${policyDaysToExpiry} day${policyDaysToExpiry === 1 ? '' : 's'}`}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Select a weekly plan to continue automated claim protection without interruption.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                  {['basic', 'standard', 'premium'].map((planTier) => (
                    <button
                      key={planTier}
                      className={`btn btn-sm ${selectedRenewPlan === planTier ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSelectedRenewPlan(planTier)}
                    >
                      {planTier.charAt(0).toUpperCase() + planTier.slice(1)}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary" onClick={handleRenewPolicy} disabled={renewingPolicy}>
                  {renewingPolicy ? 'Activating...' : 'Renew Weekly Policy'}
                </button>
              </div>
            )}

            {/* City risk profile */}
            <RiskProfileCard city={partner.primaryDeliveryCity} />

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Customer Support</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Raise requests and track response status from your dashboard.</div>
                </div>
                <span className="badge badge-info">Partner Support</span>
              </div>

              {supportError && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{supportError}</div>}
              {supportInfo && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{supportInfo}</div>}

              <div className="form-grid" style={{ marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={supportForm.issueCategory}
                    onChange={(event) => handleSupportFormChange('issueCategory', event.target.value)}
                  >
                    {SUPPORT_CATEGORY_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Mobile Number</label>
                  <input
                    className="form-input"
                    value={supportForm.mobilePhoneNumber}
                    onChange={(event) => handleSupportFormChange('mobilePhoneNumber', event.target.value)}
                    placeholder={partner.mobilePhoneNumber || 'Optional'}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Subject</label>
                <input
                  className="form-input"
                  value={supportForm.subject}
                  onChange={(event) => handleSupportFormChange('subject', event.target.value)}
                  placeholder="Briefly describe the issue"
                />
              </div>

              <div className="form-group" style={{ marginBottom: '0.9rem' }}>
                <label className="form-label">Message</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={supportForm.message}
                  onChange={(event) => handleSupportFormChange('message', event.target.value)}
                  placeholder="Tell us what happened and how we can help"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Stored in MongoDB for follow-up by support staff.</div>
                <button className="btn btn-primary btn-sm" onClick={handleSupportRequestSubmit} disabled={supportSubmitting}>
                  {supportSubmitting ? 'Submitting...' : 'Submit Support Request'}
                </button>
              </div>

              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>My Recent Tickets</div>
                {supportLoading ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading support tickets...</div>
                ) : supportTickets.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No support tickets yet.</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Category</th>
                          <th>Status</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supportTickets.map((ticket) => (
                          <tr key={ticket._id}>
                            <td>
                              <div className="td-name">{ticket.subject}</div>
                              <div className="td-sub">{ticket.message}</div>
                            </td>
                            <td style={{ textTransform: 'capitalize' }}>
                              {SUPPORT_CATEGORY_OPTIONS.find((option) => option.value === ticket.issueCategory)?.label || ticket.issueCategory}
                            </td>
                            <td>
                              <span className={`badge ${ticket.ticketStatus === 'resolved' || ticket.ticketStatus === 'closed' ? 'badge-approved' : ticket.ticketStatus === 'in_progress' ? 'badge-active' : 'badge-pending'}`}>
                                <span className="badge-dot" />
                                {SUPPORT_STATUS_VALUE_TO_LABEL[ticket.ticketStatus] || String(ticket.ticketStatus || 'open').replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                              {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('en-IN') : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <DisruptionMap
              partnerCoordinates={partner.primaryDeliveryZoneCoordinates}
              events={events.slice(0, 25)}
            />

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ fontWeight: 700 }}>Weekly Earnings vs Payout</div>
                {earningsSummary && (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    Total payout (8 weeks): {formatInr(earningsSummary.totalPayoutInRangeInRupees)}
                  </div>
                )}
              </div>
              <EarningsTrendChart trend={earningsTrend} />
            </div>

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
                          <th>Timeline</th>
                          <th>Requested</th>
                          <th>Paid Out</th>
                          <th>Claim Confidence</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {claims.map(c => (
                          <tr key={c._id}>
                            <td>
                              <div className="td-name">{humanizeDisruptionType(c.triggeringDisruptionEventId?.disruptionType) || ''}</div>
                              <div className="td-sub">{c.triggeringDisruptionEventId?.affectedCityName || ''}</div>
                            </td>
                            <td><ClaimTimeline status={c.currentClaimStatus} /></td>
                            <td>{formatInr(c.requestedCompensationAmountInRupees)}</td>
                            <td style={{ color: 'var(--emerald)', fontWeight: 700 }}>
                              {c.approvedPayoutAmountInRupees != null ? formatInr(c.approvedPayoutAmountInRupees) : ''}
                            </td>
                            <td style={{ maxWidth: 260 }}>
                              {extractClaimConfidenceNotes(c).length === 0 ? (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No anomaly flags</span>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem' }}>
                                  {extractClaimConfidenceNotes(c).slice(0, 2).map((noteText, noteIndex) => (
                                    <span key={`${c._id}-${noteIndex}`} style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
                                      • {noteText}
                                    </span>
                                  ))}
                                </div>
                              )}
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

      {showPayout && claimResult && (
        <PayoutModal
          amount={claimResult.claim?.approvedPayoutAmountInRupees || 0}
          txnId={claimResult.claim?.razorpayPayoutTransactionId}
          partnerName={partner?.fullName}
          onClose={() => setShowPayout(false)}
        />
      )}
    </div>
  );
}
