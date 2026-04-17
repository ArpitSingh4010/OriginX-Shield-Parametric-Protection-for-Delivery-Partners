import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { healthCheck, submitSupportTicket } from '../api/rakshaRideApi';

const PLANS = [
  { tier: 'basic',    premium: 25,  coverage: 300,  badge: '🛡️', popular: false },
  { tier: 'standard', premium: 40,  coverage: 500,  badge: '⚡', popular: true  },
  { tier: 'premium',  premium: 60,  coverage: 700,  badge: '👑', popular: false },
];

const TRIGGERS = [
  { icon: '🌧️', label: 'Heavy Rain',     value: '> 50 mm',  color: '#38bdf8' },
  { icon: '🌡️', label: 'Extreme Heat',   value: '> 42 C',  color: '#f59e0b' },
  { icon: '🏭', label: 'Hazardous AQI',  value: '> 300',    color: '#a78bfa' },
];

const STEPS = [
  { icon: '📝', title: 'Register', desc: 'Sign up and choose a weekly plan tailored to your earnings and city.' },
  { icon: '📡', title: 'We Monitor 24/7', desc: 'RakshaRide watches live weather and AQI data across 8 Indian cities.' },
  { icon: '💸', title: 'Auto Payout', desc: 'When a threshold is breached, your compensation is triggered instantly.' },
];

const STATS = [
  { value: '50M+',  label: 'Gig workers in India' },
  { value: '₹700',  label: 'Max weekly payout' },
  { value: '3',     label: 'Auto-trigger conditions' },
  { value: '< 1s',  label: 'Claim processing time' },
];

const SUPPORT_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'claims', label: 'Claim Issue' },
  { value: 'policy', label: 'Policy Help' },
  { value: 'payment', label: 'Payment/Payout' },
  { value: 'technical', label: 'Technical' },
  { value: 'account', label: 'Account' },
];

const formatInr = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

export default function Landing() {
  const navigate = useNavigate();
  const [serverOk, setServerOk] = useState(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [supportSuccess, setSupportSuccess] = useState('');
  const [supportForm, setSupportForm] = useState({
    fullName: '',
    emailAddress: '',
    mobilePhoneNumber: '',
    deliveryPartnerId: '',
    issueCategory: 'general',
    subject: '',
    message: '',
  });

  useEffect(() => {
    // Defer health check to after page is interactive
    const timerId = setTimeout(() => {
      healthCheck()
        .then(() => setServerOk(true))
        .catch(() => setServerOk(false));
    }, 2000);
    return () => clearTimeout(timerId);
  }, []);

  const handleSupportChange = (fieldName, fieldValue) => {
    setSupportForm((previousForm) => ({
      ...previousForm,
      [fieldName]: fieldValue,
    }));
  };

  const handleSupportSubmit = async (event) => {
    event.preventDefault();
    setSupportError('');
    setSupportSuccess('');

    if (!supportForm.fullName.trim() || !supportForm.emailAddress.trim() || !supportForm.subject.trim() || !supportForm.message.trim()) {
      setSupportError('Please fill full name, email, subject and message.');
      return;
    }

    setSupportLoading(true);
    try {
      const submissionPayload = {
        fullName: supportForm.fullName.trim(),
        emailAddress: supportForm.emailAddress.trim(),
        mobilePhoneNumber: supportForm.mobilePhoneNumber.trim(),
        deliveryPartnerId: supportForm.deliveryPartnerId.trim(),
        issueCategory: supportForm.issueCategory,
        subject: supportForm.subject.trim(),
        message: supportForm.message.trim(),
      };

      await submitSupportTicket(submissionPayload);

      setSupportSuccess('Support request submitted. Our team will reach out soon.');
      setSupportForm((previousForm) => ({
        ...previousForm,
        subject: '',
        message: '',
      }));
    } catch (error) {
      setSupportError(error.message || 'Failed to submit support request.');
    } finally {
      setSupportLoading(false);
    }
  };

  return (
    <div className="page">
      {/*  Hero  */}
      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        padding: '6rem 2rem 4rem',
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(245,158,11,0.12) 0%, transparent 70%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background blobs */}
        <div style={{
          position: 'absolute', top: '15%', right: '8%',
          width: 420, height: 420, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)',
          animation: 'float 7s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', bottom: '20%', left: '5%',
          width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
          animation: 'float 9s ease-in-out infinite reverse',
        }} />

        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
            {/* Left */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              <div>
                <div className="tag" style={{ marginBottom: '1.25rem' }}>
                   Built for India's Gig Economy
                </div>
                <h1 style={{
                  fontSize: 'clamp(2.4rem, 5vw, 3.6rem)', fontWeight: 900,
                  lineHeight: 1.1, letterSpacing: '-2px',
                }}>
                  Protecting<br />India's<br />
                  <span className="gradient-text">Delivery Heroes</span>
                </h1>
              </div>

              <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 460 }}>
                Automatic income protection when heavy rain, extreme heat, or
                high pollution disrupts your deliveries. No forms, no delays 
                payouts in seconds.
              </p>

              {/* Trigger pills */}
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {TRIGGERS.map(t => (
                  <div key={t.label} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.4rem 0.85rem', borderRadius: 20,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: '0.82rem',
                  }}>
                    {t.icon} <strong style={{ color: t.color }}>{t.value}</strong> {t.label}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-primary btn-lg" onClick={() => navigate('/register')}>
                  Get Protected Now 
                </button>
                <button className="btn btn-secondary btn-lg" onClick={() => navigate('/dashboard')}>
                  My Dashboard
                </button>
              </div>

              {serverOk !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: serverOk ? 'var(--emerald)' : 'var(--red)' }} />
                  <span style={{ color: 'var(--text-muted)' }}>
                    API {serverOk ? 'online' : 'offline'}
                  </span>
                </div>
              )}
            </div>

            {/* Right  floating card */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-accent)',
                borderRadius: 24, padding: '2rem', maxWidth: 340, width: '100%',
                boxShadow: '0 24px 80px rgba(245,158,11,0.12)',
                animation: 'float 6s ease-in-out infinite',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Live Disruption Alert</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--emerald)', animation: 'pulse 1.5s infinite' }} />
                </div>

                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🌧️</div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.25rem' }}>Heavy Rainfall Detected</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Chennai  78 mm in last hour</div>

                <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: '1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--emerald)', fontWeight: 700, marginBottom: '0.25rem' }}>AUTO-PAYOUT TRIGGERED</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--emerald)' }}>{formatInr(350)}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Credited to your account</div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span>Raju Kumar  Standard Plan</span>
                  <span>Just now</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/*  Stats Bar  */}
      <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '2.5rem 2rem' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2rem', textAlign: 'center' }}>
            {STATS.map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 900, letterSpacing: '-1px', color: 'var(--amber)' }}>{s.value}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*  How It Works  */}
      <section className="section">
        <div className="container">
          <div className="section-header center">
            <div className="tag">How It Works</div>
            <h2 className="section-title">Three steps to income security</h2>
            <p className="section-sub">RakshaRide handles everything automatically once you subscribe.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            {STEPS.map((s, i) => (
              <div className="card" key={s.title} style={{ textAlign: 'center', position: 'relative' }}>
                <div style={{
                  position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--amber)', color: '#0a0e1a',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.78rem', fontWeight: 800,
                }}>{i + 1}</div>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', marginTop: '0.5rem' }}>{s.icon}</div>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{s.title}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.65 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*  Plans  */}
      <section className="section" style={{ background: 'rgba(255,255,255,0.01)' }}>
        <div className="container">
          <div className="section-header center">
            <div className="tag">Weekly Plans</div>
            <h2 className="section-title">Affordable protection, serious coverage</h2>
            <p className="section-sub">All plans auto-renew weekly. Cancel anytime.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', maxWidth: 800, margin: '0 auto' }}>
            {PLANS.map(p => (
              <div key={p.tier} className="card" style={{
                textAlign: 'center', position: 'relative',
                border: p.popular ? '1px solid var(--amber)' : undefined,
                background: p.popular ? 'rgba(245,158,11,0.05)' : undefined,
              }}>
                {p.popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--amber)', color: '#0a0e1a',
                    padding: '2px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}>Most Popular</div>
                )}
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{p.badge}</div>
                <div style={{ fontWeight: 700, textTransform: 'capitalize', marginBottom: '0.25rem' }}>{p.tier}</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-1px', color: 'var(--amber)', marginBottom: '0.15rem' }}>
                  {formatInr(p.premium)}<span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/wk</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                  Up to {formatInr(p.coverage)} coverage
                </div>
                <button className={`btn btn-sm ${p.popular ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: '100%' }} onClick={() => navigate('/register')}>
                  Get {p.tier}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*  AI / Tech  */}
      <section className="section">
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'center' }}>
            <div>
              <div className="tag" style={{ marginBottom: '1rem' }}>AI-Powered</div>
              <h2 className="section-title" style={{ marginBottom: '1rem' }}>Fraud-proof by design</h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: '1.5rem' }}>
                RakshaRide uses a multi-layer AI verification system. Each claim is scored
                against location consistency, delivery platform activity, and claim frequency
                patterns before any payout is approved.
              </p>
              {[
                ['', 'Location cross-validation', 'GPS vs. network signal (Haversine distance)'],
                ['', 'Platform activity check', 'Minimum 30 min active on delivery app'],
                ['', 'Claim frequency analysis', 'Max 3 auto-approvals per week'],
                ['', 'ML ensemble scoring', 'GradientBoosting + rule hybrid (activity, location, frequency)'],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem',
                  }}>{icon}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{title}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[
                { label: 'Claims processed',       value: '12,400+', icon: '🧾' },
                { label: 'Auto-approved',           value: '94.2%',   icon: '✅' },
                { label: 'Fraud attempts blocked',  value: '340+',    icon: '🛑' },
                { label: 'Avg payout time',         value: '< 2 sec', icon: '⚡' },
              ].map(s => (
                <div className="card" key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>{s.icon}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--amber)' }}>{s.value}</div>
                  <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/*  CTA  */}
      <section className="section" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="section-header center">
            <div className="tag">Customer Support</div>
            <h2 className="section-title">Need help? Talk to RakshaRide support</h2>
            <p className="section-sub">Your request is stored in our MongoDB support queue for quick follow-up.</p>
          </div>

          <form className="card" onSubmit={handleSupportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {supportError && <div className="alert alert-error">{supportError}</div>}
            {supportSuccess && <div className="alert alert-success">{supportSuccess}</div>}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  className="form-input"
                  value={supportForm.fullName}
                  onChange={(event) => handleSupportChange('fullName', event.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  className="form-input"
                  type="email"
                  value={supportForm.emailAddress}
                  onChange={(event) => handleSupportChange('emailAddress', event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Mobile Number (Optional)</label>
                <input
                  className="form-input"
                  value={supportForm.mobilePhoneNumber}
                  onChange={(event) => handleSupportChange('mobilePhoneNumber', event.target.value)}
                  placeholder="9876543210"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Delivery Partner ID (Optional)</label>
                <input
                  className="form-input"
                  value={supportForm.deliveryPartnerId}
                  onChange={(event) => handleSupportChange('deliveryPartnerId', event.target.value)}
                  placeholder="Mongo ObjectId"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Issue Category</label>
                <select
                  className="form-select"
                  value={supportForm.issueCategory}
                  onChange={(event) => handleSupportChange('issueCategory', event.target.value)}
                >
                  {SUPPORT_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>{category.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Subject</label>
                <input
                  className="form-input"
                  value={supportForm.subject}
                  onChange={(event) => handleSupportChange('subject', event.target.value)}
                  placeholder="What do you need help with?"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Message</label>
              <textarea
                className="form-input"
                value={supportForm.message}
                onChange={(event) => handleSupportChange('message', event.target.value)}
                placeholder="Describe your issue"
                rows={5}
                style={{ resize: 'vertical' }}
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={supportLoading} style={{ alignSelf: 'flex-start' }}>
              {supportLoading ? 'Submitting...' : 'Submit Support Request'}
            </button>
          </form>
        </div>
      </section>

      <section className="section" style={{
        background: 'radial-gradient(ellipse 70% 80% at 50% 50%, rgba(245,158,11,0.08) 0%, transparent 70%)',
        textAlign: 'center',
      }}>
        <div className="container-sm">
          <h2 className="section-title" style={{ marginBottom: '1rem' }}>
            Ready to protect your income?
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.05rem' }}>
            Join thousands of delivery partners who never worry about weather disruptions.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={() => navigate('/register')}>
              Register Now  It's Free
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => navigate('/dashboard')}>
              View Dashboard
            </button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}>
            IRDAI prototype  Razorpay secured  No hidden charges
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
        <div> <strong style={{ color: 'var(--amber)' }}>RakshaRide</strong> by Team OriginX  Guidewire Hackathon 2026</div>
        <div style={{ marginTop: '0.35rem' }}>Shrestha Verdhan  Arpit Singh  Ramya Pathak  Aryabrata Kundu</div>
      </footer>
    </div>
  );
}
