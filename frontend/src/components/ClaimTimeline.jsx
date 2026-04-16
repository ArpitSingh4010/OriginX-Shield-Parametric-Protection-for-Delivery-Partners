import React from 'react';

const FLOW = ['pending_verification', 'flagged_for_manual_review', 'approved_for_payout', 'payout_processed'];

const LABELS = {
  pending_verification: 'Filed',
  flagged_for_manual_review: 'Under Review',
  approved_for_payout: 'Approved',
  payout_processed: 'Paid',
  rejected: 'Rejected',
};

export default function ClaimTimeline({ status }) {
  if (status === 'rejected') {
    return <span className="badge badge-rejected">Rejected</span>;
  }

  const statusIndex = Math.max(FLOW.indexOf(status), 0);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
      {FLOW.map((step, index) => {
        const isDone = index <= statusIndex;
        const isCurrent = index === statusIndex;

        return (
          <React.Fragment key={step}>
            <span
              title={LABELS[step]}
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: isDone ? (isCurrent ? '#f59e0b' : '#10b981') : 'rgba(255,255,255,0.2)',
                display: 'inline-block',
              }}
            />
            {index < FLOW.length - 1 && (
              <span style={{ width: 16, height: 1, background: isDone ? '#10b981' : 'rgba(255,255,255,0.14)' }} />
            )}
          </React.Fragment>
        );
      })}
      <span style={{ marginLeft: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
        {LABELS[status] || LABELS.pending_verification}
      </span>
    </div>
  );
}
