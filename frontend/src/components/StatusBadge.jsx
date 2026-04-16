import React from 'react';

const STATUS_MAP = {
  // Claim statuses
  pending_verification:     { label: 'Pending',       cls: 'badge-pending'  },
  verification_in_progress: { label: 'In Progress',   cls: 'badge-pending'  },
  approved_for_payout:      { label: 'Approved',      cls: 'badge-approved' },
  payout_processed:         { label: 'Paid Out',      cls: 'badge-approved' },
  flagged_for_manual_review:{ label: 'Flagged',       cls: 'badge-flagged'  },
  rejected:                 { label: 'Rejected',      cls: 'badge-rejected' },
  // Policy statuses
  active:                   { label: 'Active',        cls: 'badge-active'   },
  expired:                  { label: 'Expired',       cls: 'badge-expired'  },
  cancelled:                { label: 'Cancelled',     cls: 'badge-rejected' },
  suspended:                { label: 'Suspended',     cls: 'badge-flagged'  },
  // Disruption types
  heavy_rainfall:           { label: '🌧 Heavy Rain',   cls: 'badge-info'    },
  extreme_heat:             { label: '🌡 Extreme Heat', cls: 'badge-pending' },
  hazardous_air_quality:    { label: '💨 Hazardous AQI',cls: 'badge-flagged' },
  lpg_shortage:             { label: '⛽ LPG Shortage', cls: 'badge-pending' },
  area_curfew:              { label: '🚫 Curfew',       cls: 'badge-rejected'},
  flooding:                 { label: '🌊 Flooding',     cls: 'badge-info'   },
  cyclone_alert:            { label: '🌀 Cyclone Alert', cls: 'badge-flagged' },
  thunderstorm:             { label: '⛈ Thunderstorm',  cls: 'badge-pending' },
  waterlogging:             { label: '💧 Waterlogging',  cls: 'badge-info' },
  road_blockage:            { label: '🚧 Road Blockage', cls: 'badge-rejected' },
  other:                    { label: 'Other',            cls: 'badge-info' },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || { label: status, cls: 'badge-info' };
  return (
    <span className={`badge ${cfg.cls}`} role="status" aria-label={`Status: ${cfg.label}`}>
      <span className="badge-dot" />
      {cfg.label}
    </span>
  );
}
