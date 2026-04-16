import React from 'react';

function polylinePoints(series = [], width, height, padding, maxValue) {
  if (!series.length) {
    return '';
  }

  return series
    .map((entry, index) => {
      const x = padding + (index / Math.max(series.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - (Number(entry || 0) / Math.max(maxValue, 1)) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
}

export default function EarningsTrendChart({ trend = [] }) {
  if (!Array.isArray(trend) || trend.length === 0) {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem 0' }}>
        Earnings trend is unavailable.
      </div>
    );
  }

  const width = 420;
  const height = 170;
  const padding = 18;

  const earningsSeries = trend.map((entry) => Number(entry.estimatedEarningsInRupees || 0));
  const payoutsSeries = trend.map((entry) => Number(entry.payoutReceivedInRupees || 0));
  const labels = trend.map((entry) => entry.label || 'W');
  const maxValue = Math.max(1, ...earningsSeries, ...payoutsSeries);

  const earningsPoints = polylinePoints(earningsSeries, width, height, padding, maxValue);
  const payoutsPoints = polylinePoints(payoutsSeries, width, height, padding, maxValue);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Weekly earnings versus payout trend">
        <defs>
          <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>

        <polyline points={earningsPoints} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={payoutsPoints} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {payoutsSeries.map((value, index) => {
          const x = padding + (index / Math.max(payoutsSeries.length - 1, 1)) * (width - padding * 2);
          const y = height - padding - (Number(value || 0) / Math.max(maxValue, 1)) * (height - padding * 2);
          return <circle key={`p-${index}`} cx={x} cy={y} r={2.8} fill="#10b981" />;
        })}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.45rem', color: 'var(--text-muted)', fontSize: '0.68rem' }}>
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.65rem', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 10, height: 2, background: '#38bdf8', display: 'inline-block' }} /> Estimated Earnings
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 10, height: 2, background: '#10b981', display: 'inline-block' }} /> Payout Received
        </span>
      </div>
    </div>
  );
}
