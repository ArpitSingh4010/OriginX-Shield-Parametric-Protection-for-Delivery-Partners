import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  registerPartner,
  subscribePolicy,
  aiQuickRiskAssess,
  verifyPartnerEmailOtp,
  resendPartnerEmailVerificationOtp,
} from '../api/rakshaRideApi';

const PLATFORMS = ['swiggy', 'zomato', 'dunzo', 'blinkit', 'other'];
const CITIES = ['Chennai', 'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad'];
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
const EARNINGS = [
  { label: 'Less than 15000', value: 14000 },
  { label: '15000 - 22000', value: 18000 },
  { label: '22000 - 32000', value: 27000 },
  { label: '32000 - 45000', value: 38000 },
  { label: 'More than 45000', value: 46000 },
];
const RISK_CATEGORIES = [
  { label: 'Low Risk',       value: 'low_risk_zone' },
  { label: 'Moderate Risk',  value: 'moderate_risk_zone' },
  { label: 'High Risk',      value: 'high_risk_zone' },
  { label: 'Very High Risk', value: 'very_high_risk_zone' },
];
const PLANS = [
  { tier: 'basic',    premium: 25,  coverage: 300,  icon: '' },
  { tier: 'standard', premium: 40,  coverage: 500,  icon: '' },
  { tier: 'premium',  premium: 60,  coverage: 700,  icon: '' },
];

const STEP_LABELS = ['Personal Details', 'Work Details', 'Verify Email', 'Choose Plan'];
const formatInr = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

const EMAIL_VERIFICATION_STEP = 2;

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [riskSuggestion, setRiskSuggestion] = useState(null);

  const [form, setForm] = useState({
    fullName: '', emailAddress: '', mobilePhoneNumber: '',
    password: '',
    primaryDeliveryCity: 'Chennai', deliveryPlatformNames: [],
    averageMonthlyEarningsInRupees: 18000, locationRiskCategory: 'moderate_risk_zone',
  });

  const [registeredPartner, setRegisteredPartner]   = useState(null);
  const [selectedPlan,       setSelectedPlan]       = useState('standard');
  const [policy,             setPolicy]             = useState(null);
  const [copied,             setCopied]             = useState(false);
  const [verificationCode,   setVerificationCode]   = useState('');
  const [verificationHint,   setVerificationHint]   = useState('');
  const [verifyingOtp,       setVerifyingOtp]       = useState(false);
  const [resendingOtp,       setResendingOtp]       = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const togglePlatform = (p) =>
    set('deliveryPlatformNames',
      form.deliveryPlatformNames.includes(p)
        ? form.deliveryPlatformNames.filter(x => x !== p)
        : [...form.deliveryPlatformNames, p]
    );

  const fetchAiRisk = async (city) => {
    try {
      const r = await aiQuickRiskAssess({ cityName: city });
      if (r.success) {
        setRiskSuggestion(r);
        set('locationRiskCategory', r.assignedRiskCategory);
      }
    } catch { /* AI server optional */ }
  };

  const handleCityChange = (city) => {
    set('primaryDeliveryCity', city);
    fetchAiRisk(city);
  };

  /*  Step 0  1  */
  const validateStep0 = () => {
    if (!form.fullName.trim()) return 'Full name is required.';
    if (!form.emailAddress.trim() || !form.emailAddress.includes('@')) return 'Valid email is required.';
    if (!form.password || form.password.length < 6) return 'Password must be at least 6 characters.';
    if (!form.mobilePhoneNumber.trim() || form.mobilePhoneNumber.length < 10) return 'Valid 10-digit phone is required.';
    return '';
  };

  /*  Step 1  2: register  */
  const handleRegister = async () => {
    if (form.deliveryPlatformNames.length === 0) { setError('Select at least one platform.'); return; }
    setError(''); setLoading(true);
    try {
      const coords = CITY_COORDS[form.primaryDeliveryCity] || { latitude: 13.08, longitude: 80.27 };
      const res = await registerPartner({
        ...form,
        primaryDeliveryZoneCoordinates: coords,
      });
      setRegisteredPartner(res.deliveryPartner);
      setVerificationHint(res?.emailDelivery?.message || 'Verification code sent to your email address.');
      setStep(EMAIL_VERIFICATION_STEP);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleVerifyEmailOtp = async () => {
    if (!registeredPartner?.emailAddress) {
      setError('Missing registered email address. Please register again.');
      return;
    }
    if (String(verificationCode).trim().length !== 6) {
      setError('Enter the 6-digit verification code sent to your email.');
      return;
    }

    setError('');
    setVerifyingOtp(true);
    try {
      await verifyPartnerEmailOtp({
        emailAddress: registeredPartner.emailAddress,
        verificationCode: String(verificationCode).trim(),
      });
      setStep(3);
      setVerificationHint('Email verified. Continue to choose your plan.');
    } catch (e) {
      setError(e.message);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (!registeredPartner?.emailAddress) {
      setError('Missing registered email address. Please register again.');
      return;
    }

    setError('');
    setResendingOtp(true);
    try {
      const resendResponse = await resendPartnerEmailVerificationOtp({
        emailAddress: registeredPartner.emailAddress,
      });
      setVerificationHint(resendResponse?.emailDelivery?.message || resendResponse?.message || 'Verification code resent.');
    } catch (e) {
      setError(e.message);
    } finally {
      setResendingOtp(false);
    }
  };

  /*  Step 2: subscribe  */
  const handleSubscribe = async () => {
    setError(''); setLoading(true);
    try {
      const res = await subscribePolicy({
        deliveryPartnerId: registeredPartner.partnerId,
        selectedPlanTier: selectedPlan,
      });
      setPolicy(res.insurancePolicy);
      setStep(4);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const copyId = () => {
    navigator.clipboard.writeText(registeredPartner?.partnerId || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /*  Success screen  */
  if (step === 4 && policy) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6rem 1rem' }}>
        <div className="card animate-slide-up" style={{ maxWidth: 500, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}></div>
          <h2 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>You're Protected!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
            Your <strong style={{ color: 'var(--amber)', textTransform: 'capitalize' }}>{policy.selectedPlanTier}</strong> plan
            is active until {new Date(policy.policyEndDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[
              ['Weekly Premium', formatInr(policy.weeklyPremiumChargedInRupees)],
              ['Max Coverage',   formatInr(policy.maximumWeeklyCoverageInRupees)],
            ].map(([l, v]) => (
              <div key={l} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '0.85rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{l}</div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--amber)' }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Partner ID  save this!</div>
            <div className="copy-box">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{registeredPartner.partnerId}</span>
              <button onClick={copyId}>{copied ? ' Copied!' : 'Copy'}</button>
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: '100%' }}
            onClick={() => navigate(`/dashboard?id=${registeredPartner.partnerId}`)}>
            Go to My Dashboard 
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: '5rem 1rem 3rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 580 }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{ fontWeight: 800, fontSize: '1.8rem', letterSpacing: '-0.5px', marginBottom: '0.35rem' }}>
            Start your protection
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Takes less than 2 minutes.</p>
        </div>

        {/* Step indicator */}
        <div className="steps">
          {STEP_LABELS.map((label, i) => (
            <React.Fragment key={label}>
              <div className="step-item">
                <div className={`step-num ${i < step ? 'done' : i === step ? 'active' : 'idle'}`}>
                  {i < step ? '' : i + 1}
                </div>
                <span className={`step-label${i === step ? ' active' : ''}`}>{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && <div className="step-connector" />}
            </React.Fragment>
          ))}
        </div>

        <div className="card animate-fade-in">
          {error && <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}> {error}</div>}

          {/*  Step 0: Personal  */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" placeholder="Raju Kumar" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input className="form-input" type="email" placeholder="raju@example.com" value={form.emailAddress} onChange={e => set('emailAddress', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input className="form-input" type="password" placeholder="At least 6 characters" value={form.password} onChange={e => set('password', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Mobile Number</label>
                  <input className="form-input" type="tel" placeholder="9876543210" value={form.mobilePhoneNumber} onChange={e => set('mobilePhoneNumber', e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '0.5rem' }}
                onClick={() => { const e = validateStep0(); if (e) { setError(e); return; } setError(''); setStep(1); }}>
                Continue 
              </button>
            </div>
          )}

          {/*  Step 1: Work details  */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Primary Delivery City</label>
                <select className="form-select" value={form.primaryDeliveryCity} onChange={e => handleCityChange(e.target.value)}>
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {riskSuggestion && (
                  <div className="form-hint" style={{ color: 'var(--amber)' }}>
                     AI Risk: <strong>{riskSuggestion.assignedRiskCategory.replace(/_/g, ' ')}</strong> (score {riskSuggestion.computedRiskScore})
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Delivery Platforms</label>
                <div className="checkbox-group">
                  {PLATFORMS.map(p => (
                    <label key={p} className={`checkbox-chip${form.deliveryPlatformNames.includes(p) ? ' selected' : ''}`}>
                      <input type="checkbox" checked={form.deliveryPlatformNames.includes(p)} onChange={() => togglePlatform(p)} />
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Monthly Earnings</label>
                  <select className="form-select" value={form.averageMonthlyEarningsInRupees} onChange={e => set('averageMonthlyEarningsInRupees', Number(e.target.value))}>
                    {EARNINGS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Zone Risk Level</label>
                  <select className="form-select" value={form.locationRiskCategory} onChange={e => set('locationRiskCategory', e.target.value)}>
                    {RISK_CATEGORIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setError(''); setStep(0); }}> Back</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleRegister} disabled={loading}>
                  {loading ? <><span className="spinner spinner-sm" /> Registering</> : 'Register & Choose Plan '}
                </button>
              </div>
            </div>
          )}

          {/*  Step 2: Verify Email */}
          {step === 2 && registeredPartner && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="alert alert-warning" style={{ marginBottom: '0.25rem' }}>
                Verify your email before activating any plan.
              </div>

              <div className="form-group">
                <label className="form-label">Registered Email Address</label>
                <input className="form-input" value={registeredPartner.emailAddress || ''} disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Verification Code</label>
                <input
                  className="form-input"
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                {verificationHint && <div className="form-hint" style={{ color: 'var(--text-secondary)' }}>{verificationHint}</div>}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn-secondary" onClick={handleResendEmailOtp} disabled={resendingOtp}>
                  {resendingOtp ? 'Resending...' : 'Resend Code'}
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleVerifyEmailOtp} disabled={verifyingOtp}>
                  {verifyingOtp ? 'Verifying...' : 'Verify Email'}
                </button>
              </div>
            </div>
          )}

          {/*  Step 3: Plan  */}
          {step === 3 && registeredPartner && (
            <div>
              <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
                 Registered as <strong>{registeredPartner.fullName}</strong> in {registeredPartner.primaryDeliveryCity}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {PLANS.map(p => (
                  <label key={p.tier} style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 1.25rem', borderRadius: 12, cursor: 'pointer',
                    border: `1px solid ${selectedPlan === p.tier ? 'var(--amber)' : 'var(--border)'}`,
                    background: selectedPlan === p.tier ? 'rgba(245,158,11,0.06)' : 'var(--bg-card)',
                    transition: 'var(--transition)',
                  }}>
                    <input type="radio" name="plan" value={p.tier} checked={selectedPlan === p.tier}
                      onChange={() => setSelectedPlan(p.tier)} style={{ display: 'none' }} />
                    <span style={{ fontSize: '1.4rem' }}>{p.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{p.tier}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Up to {formatInr(p.coverage)} coverage/week</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--amber)' }}>{formatInr(p.premium)}<span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>/wk</span></div>
                  </label>
                ))}
              </div>

              <button className="btn btn-primary btn-lg" style={{ width: '100%' }}
                onClick={handleSubscribe} disabled={loading}>
                {loading ? <><span className="spinner spinner-sm" /> Activating</> : `Activate ${selectedPlan} plan `}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

