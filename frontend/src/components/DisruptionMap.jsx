import React from 'react';

const INDIA_BOUNDS = {
  minLat: 6,
  maxLat: 37,
  minLon: 68,
  maxLon: 98,
};

function toPoint({ latitude = 0, longitude = 0 }, width, height, padding = 18) {
  const xRatio = (longitude - INDIA_BOUNDS.minLon) / (INDIA_BOUNDS.maxLon - INDIA_BOUNDS.minLon);
  const yRatio = (latitude - INDIA_BOUNDS.minLat) / (INDIA_BOUNDS.maxLat - INDIA_BOUNDS.minLat);

  const x = padding + Math.max(0, Math.min(1, xRatio)) * (width - padding * 2);
  const y = height - padding - Math.max(0, Math.min(1, yRatio)) * (height - padding * 2);

  return { x, y };
}

export default function DisruptionMap({ partnerCoordinates, events = [] }) {
  const WIDTH = 520;
  const HEIGHT = 300;

  const safeEvents = events.filter((eventItem) => eventItem?.affectedZoneCentreCoordinates);
  const partnerPoint = partnerCoordinates
    ? toPoint(partnerCoordinates, WIDTH, HEIGHT)
    : null;

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
        <div style={{ fontWeight: 700 }}>Disruption Map</div>
        <span className="badge badge-info">Live Demo Layer</span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', display: 'block', borderRadius: 12, background: 'linear-gradient(180deg, rgba(56,189,248,0.10), rgba(15,23,42,0.6))' }}>
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={WIDTH} height={HEIGHT} fill="url(#grid)" />

        {safeEvents.map((eventItem) => {
          const eventPoint = toPoint(eventItem.affectedZoneCentreCoordinates, WIDTH, HEIGHT);
          return (
            <g key={eventItem._id}>
              <circle cx={eventPoint.x} cy={eventPoint.y} r={6} fill="#ef4444" opacity="0.9" />
              <circle cx={eventPoint.x} cy={eventPoint.y} r={14} fill="none" stroke="#ef4444" strokeOpacity="0.35" />
              <text x={eventPoint.x + 9} y={eventPoint.y - 10} fill="#fca5a5" fontSize="10">
                {eventItem.affectedCityName}
              </text>
            </g>
          );
        })}

        {partnerPoint && (
          <g>
            <circle cx={partnerPoint.x} cy={partnerPoint.y} r={7} fill="#10b981" />
            <circle cx={partnerPoint.x} cy={partnerPoint.y} r={16} fill="none" stroke="#10b981" strokeOpacity="0.35" />
            <text x={partnerPoint.x + 10} y={partnerPoint.y + 4} fill="#6ee7b7" fontSize="10">You</text>
          </g>
        )}
      </svg>

      <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.65rem' }}>
        Red markers show active disruption events and green marks your delivery zone.
      </div>
    </div>
  );
}
