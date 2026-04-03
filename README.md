# GigShield - Hackathon Project

AI-powered parametric insurance for food delivery workers.

## Team OriginX

1. SHRESTHA VERDHAN  
2. ARPIT SINGH  
3. RAMYA PATHAK  
4. ARYABRATA KUNDU

## Problem

Delivery partners lose income during disruptions like heavy rain, heatwaves, poor AQI, flooding, curfews, and fuel shortages. Traditional insurance is too manual and slow for this use case.

## Solution

GigShield is a zero-touch parametric insurance system:

- user selects a weekly subscription plan
- platform monitors disruption signals
- triggers claims automatically when thresholds are crossed
- runs fraud checks
- auto-approves low-risk claims, routes risky claims to admin review

### Model Summary (Implementation-Aligned)

GigShield is implemented as a parametric micro-insurance system that combines:

- objective environmental trigger detection (rainfall, heat, AQI, LPG shortage)
- actuarial premium adjustment (plan + location + platform + seasonality + loss-ratio checks)
- fraud-aware claim processing with automatic/manual routing
- payout sustainability controls (event cap + city-level daily circuit breaker)

This keeps the system transparent and hackathon-friendly while still reflecting practical risk controls.

## Hackathon Showcase Checklist

### 1) Registration Process

- UI flow: `frontend/src/pages/Register.jsx`
- API: `POST /api/delivery-partners/register`
- Stores profile, city, platform, earnings band, risk category

### 2) Insurance Policy Management

- Subscribe plan (payment-disabled hackathon mode): `POST /api/insurance-policies/subscribe`
- Policy by ID: `GET /api/insurance-policies/:policyId`
- Partner policy history: `GET /api/insurance-policies/partner/:partnerId`
- Cancel policy: `PATCH /api/insurance-policies/:policyId/cancel`

### 3) Dynamic Premium Calculation

Implemented in `backend/services/weeklyPremiumCalculator.js` using:

- location risk multiplier
- platform multiplier
- seasonality multiplier (monsoon and summer heat windows)
- earnings-band context
- loss-ratio guardrails

Subscription API returns transparent `pricingJustification`.

AI-assisted risk hint during registration:

- UI calls `POST /ai/quick-risk-assess`
- city mapped to risk score/category

### 4) Claims Management

- Submit claim: `POST /api/insurance-claims/submit`
- Claim detail: `GET /api/insurance-claims/:claimId`
- Partner claims list: `GET /api/insurance-claims/partner/:partnerId`
- Flagged queue: `GET /api/insurance-claims/flagged`
- Review decision: `PATCH /api/insurance-claims/:claimId/review`

### 5) Automated Disruption Triggers (3-5+)

Supported triggers:

- heavy_rainfall
- extreme_heat
- hazardous_air_quality
- lpg_shortage
- flooding (mock/event-driven)
- area_curfew (mock/event-driven)

Trigger APIs:

- Threshold preview: `POST /api/disruption-events/check-threshold`
- Create disruption event: `POST /api/disruption-events`
- Auto-trigger claims for event: `POST /api/disruption-events/:eventId/trigger-claims`
- Weather monitor run-now endpoint: `POST /api/admin/trigger-weather-check`

### 6) Zero-Touch Claim UX

- automatic claim trigger for eligible active policies
- automatic fraud scoring
- instant auto-approval path for low-risk claims
- manual review fallback for suspicious claims
- payout circuit breaker checks before approval:
  - max total payout per event
  - max total city payout per day

## Admin Mode (Hackathon)

Admin panel exists for judge/demo operations:

- route: `/admin`
- frontend gate via `VITE_ADMIN_ACCESS_KEY`
- supports weather checks, disruption event creation, event-level auto-claim trigger, and flagged-claim review

## Demo Flow (3-5 minutes)

1. Register a delivery partner.
2. Subscribe a plan and show `pricingJustification`.
3. Open Admin and run weather check or create a disruption event.
4. Trigger claims for that event.
5. Show auto-approved claim + flagged/manual-review scenario.
6. Show partner dashboard claim history and policy coverage update.

## Payment Mode for Hackathon

Premium checkout is intentionally disabled by default.

- `ENABLE_PREMIUM_PAYMENT_FLOW=false`
- users can subscribe directly via `/subscribe` and access coverage immediately
- Razorpay endpoints remain available for future enablement
- payout execution defaults to mock/stub-safe mode unless live credentials are provided

## End-to-End Claim Processing Logic

1. Trigger condition detected (weather/manual event)
2. Claim initiated through API or event-trigger endpoint
3. Exclusion and severity checks run
4. Fraud verification runs (location/activity/claim-frequency)
5. Risk control checks run (event cap + city daily cap)
6. If valid, payout is processed (or kept approved-for-payout if payout gateway fails)
7. If suspicious, claim is flagged for manual admin review

## Essential Trigger Thresholds

- Heavy Rain: rainfall > 50 mm
- Extreme Heat: temperature > 42°C
- High Pollution: AQI > 300
- LPG Shortage: severity index > 70

## Hosting Handoff (What to Tell Your Friend)

To host the project completely, run and deploy these 3 services:

1. **Backend (Node/Express, port 5000)**
   - Set `MONGODB_URI`, `JWT_SECRET_KEY`, and optionally weather/payment keys.
   - Keep `ENABLE_PREMIUM_PAYMENT_FLOW=false` for demo-safe mode.
2. **AI Service (Flask, port 5001)**
   - Install `ai/requirements.txt`.
   - Expose `/health`, `/assess-risk`, `/detect-anomaly`, `/quick-risk-assess`.
3. **Frontend (Vite build)**
   - Set `VITE_API_BASE_URL` to backend URL.
   - Set `VITE_AI_BASE_URL` to AI service URL.
   - Optional: set `VITE_ADMIN_ACCESS_KEY` to gate `/admin`.

Production-ready minimum checklist:

- MongoDB reachable from backend runtime
- Backend + AI CORS allowed for frontend host
- Environment variables configured in hosting platform
- Frontend built and served from static hosting/CDN
- Backend `/api/health` and AI `/health` return healthy status
- CI checks passing (`backend npm test`, `frontend npm run build`)

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express + Mongoose
- AI service: Python Flask
- Data: MongoDB
- External data: Weather + AQI APIs

## Local Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB (local or Atlas)

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### 2) AI service

```bash
cd ai
pip install -r requirements.txt
python app.py
```

### 3) Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Environment Variables

### Backend (`backend/.env`)

- `PORT`
- `NODE_ENV`
- `MONGODB_URI`
- `JWT_SECRET_KEY`
- `ENFORCE_AUTH`
- `AUTH_DEMO_USERNAME`
- `AUTH_DEMO_PASSWORD_HASH` or `AUTH_DEMO_PASSWORD`
- `WEATHER_API_KEY`
- `POLLUTION_API_KEY`
- `WEATHER_API_BASE_URL`
- `POLLUTION_API_BASE_URL`
- `PAYOUT_MODE`
- `ENABLE_PREMIUM_PAYMENT_FLOW`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_ACCOUNT_NUMBER`

### Frontend (`frontend/.env`)

- `VITE_API_BASE_URL`
- `VITE_AI_BASE_URL`
- `VITE_RAZORPAY_KEY_ID`
- `VITE_ADMIN_ACCESS_KEY`

## API Quick Reference

### Delivery Partner

- `POST /api/delivery-partners/register`
- `GET /api/delivery-partners/:partnerId`

### Insurance Policy

- `POST /api/insurance-policies/subscribe`
- `GET /api/insurance-policies/partner/:partnerId`
- `GET /api/insurance-policies/:policyId`
- `PATCH /api/insurance-policies/:policyId/cancel`

### Insurance Claims

- `POST /api/insurance-claims/submit`
- `GET /api/insurance-claims/partner/:partnerId`
- `GET /api/insurance-claims/:claimId`
- `GET /api/insurance-claims/flagged`
- `PATCH /api/insurance-claims/:claimId/review`

### Disruption Events

- `POST /api/disruption-events`
- `GET /api/disruption-events`
- `POST /api/disruption-events/check-threshold`
- `POST /api/disruption-events/:eventId/trigger-claims`

### Admin Utility

- `POST /api/admin/trigger-weather-check`

## Tests

```bash
cd backend
npm test
```

```bash
cd frontend
npm run build
```

## Demo Assets

- Demo video: https://youtu.be/qJf-wKjICPI
- Architecture diagram: https://github.com/user-attachments/assets/9107d99c-d7ef-4b40-bc98-940dc99d9e12
- Workflow diagram: https://github.com/user-attachments/assets/97824b2b-dddb-4aa1-9db9-ee80a4e600ad
