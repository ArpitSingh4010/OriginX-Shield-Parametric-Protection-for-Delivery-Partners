# RakshaRide - Real-Time Income Protection for Gig Workers

AI-powered parametric insurance for food delivery workers.

## Team OriginX

1. SHRESTHA VERDHAN  
2. ARPIT SINGH  
3. RAMYA PATHAK  
4. ARYABRATA KUNDU

## Overview
RakshaRide is a **Guidewire-aligned, IRDAI-compliant micro-insurance platform** designed for gig workers, enabling automatic compensation when external disruptions materially impact their earning ability.

Unlike traditional parametric insurance systems that rely solely on environmental triggers, RakshaRide combines:

- Environmental signals (weather, AQI)

- Platform activity (delivery engagement)

- Behavioral patterns

To detect **actual income disruption** and trigger payouts.

The system is built as an **event-driven insurance architecture**, inspired by Guidewire-style insurance architecture, where policy, claims, and billing flows are modeled in a modular, event-driven system, while microservices handle real-time event ingestion and risk computation

## Problem
Delivery partners rely on consistent daily activity for income. External disruptions such as:

- Heavy rainfall and flooding

- Extreme heat

- Hazardous air quality

- Fuel shortages and curfews

This directly reduces their earning potential.

Traditional insurance fails because it:

- Does not cover short-term income loss

- Requires manual claims

- Has slow settlement cycles

- Cannot verify real income disruption

## Solution

RakshaRide introduces a micro-duration (weekly) income protection system.

How It Works:

- User subscribes to a weekly policy
  
- System continuously monitors disruption signals
  
- Multi-factor engine evaluates:
  
   1. weather conditions
  
   2. platform activity
  
   3. user engagement
  
- Claims are triggered automatically
  
- Claim confidence scoring determines:
  
   1. instant payout
  
   2. manual review


### Target Persona Income Bands

| Persona Segment | Monthly Earnings (INR) | Typical Daily Earnings (INR) | Risk Context |
|---|---:|---:|---|
| Entry-level | 15,000 - 22,000 | 700 | Limited buffer against missed work days |
| Mid-tier | 22,000 - 32,000 | 1,000 | Moderate stability with periodic disruption risk |
| High-activity | 32,000 - 45,000 | 1,400 | Higher income-at-risk during disruption windows |

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
- earnings-band context
- seasonality multiplier
- loss-ratio guardrails

Subscription API returns transparent `pricingJustification`.

Example plans:

| Plan | Weekly Premium (INR) | Coverage (INR) |
|---|---:|---:|
| Basic | 25 | 300 |
| Standard | 40 | 500 |
| Premium | 60 | 700 |

#### Insurance Calculation Maths

Let:
- `B` = base weekly premium of selected plan
- `L` = location risk multiplier
- `P` = average platform multiplier
- `S` = seasonal multiplier
- `k` = loss-ratio loading factor

Then the contextual weekly premium is:

`Premium = round(B Ã— L Ã— P Ã— S Ã— (1 + k))`

From current config values:
- `k = 0.10`
- `S = 1.15` (monsoon), `1.10` (summer heat), `1.00` (default)

Example (Standard plan in monsoon):
- `B = 40`, `L = 1.2`, `P = 1.05`, `S = 1.15`, `k = 0.10`
- `Premium = round(40 Ã— 1.2 Ã— 1.05 Ã— 1.15 Ã— 1.10)`
- `Premium = round(63.756) = 64 `

Projected loss ratio shown in `pricingJustification` is:

Let:
- `C` = maximum weekly coverage of selected plan
- `e` = expected payout amount as a fraction of `C` in a qualifying disruption week (not the probability of a disruption)

Then:

`Projected Loss Ratio = (C Ã— e) / Premium`

Current config source: `backend/config/parametricInsuranceConstants.js` (`PREMIUM_MODEL_ASSUMPTIONS.EXPECTED_PAYOUT_SEVERITY_RATIO = 0.15`).

Using the same example with Standard plan coverage:
- `C = 500`, `e = 0.15`, `Premium = 64`
- `Projected Loss Ratio = (500 Ã— 0.15) / 64 = 75 / 64 = 1.17` (rounded to 1.2 decimals)

Note: the resulting loss ratio of `1.2` in this worked example is included only
to show the calculation path. In the current model, it is classified as
`above_sustainable_band` and surfaced in `pricingJustification.lossRatioAssessment`.

AI-assisted risk hint during registration:

- UI calls `POST /ai/quick-risk-assess`
- city mapped to risk score/category

### 4) Claims Management

- Submit claim: `POST /api/insurance-claims/submit`
- Claim detail: `GET /api/insurance-claims/:claimId`
- Partner claims list: `GET /api/insurance-claims/partner/:partnerId`
- Flagged queue: `GET /api/insurance-claims/flagged`
- Review decision: `PATCH /api/insurance-claims/:claimId/review`

### 5) Automated Disruption Triggers 

Supported triggers:

- heavy_rainfall
- extreme_heat
- hazardous_air_quality
- lpg_shortage
- flooding (mock/event-driven)
- area_curfew (mock/event-driven)

Trigger threshold snapshot:

| Event | Trigger |
|---|---|
| Heavy Rain | Rainfall > 50 mm |
| Extreme Heat | Temperature > 42 C |
| Hazardous Air Quality | AQI > 300 |
| LPG Shortage | Severity Index > 70 |

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

## Admin Mode 

Admin panel exists for judge/demo operations:

- route: `/admin`
- frontend gate via `VITE_ADMIN_ACCESS_KEY`
- supports weather checks, disruption event creation, event-level auto-claim trigger, and flagged-claim review
- admin login email: `verdhanchiku@gmail.com`
- admin login password: `pass321`


## Payment Mode 

Premium checkout is intentionally disabled by default.

- `ENABLE_PREMIUM_PAYMENT_FLOW=false`
- users can subscribe directly via `/subscribe` and access coverage immediately
- Razorpay endpoints remain available for future enablement

## Guidewire-Centric System Design

RakshaRide leverages Guidewire as a coordinated insurance execution engine:

### PolicyCenter

- Dynamic underwriting using behavioral + environmental risk inputs
- Weekly policy issuance with configurable product definitions
- Rule-based eligibility validation

### ClaimCenter

- Event-driven FNOL (First Notice of Loss)
- Automated claim triage via confidence scoring
- SLA-based claim lifecycle enforcement
- Fraud flags routed to manual adjuster queues

### BillingCenter

- Subscription-based billing (weekly cycles)
- Payment retries and policy suspension logic
- Integration with Razorpay for reconciliation

### Data Flow

1. User registers -> KYC validation
2. Policy created -> PolicyCenter
3. Premium calculated -> rating engine
4. Payment processed -> BillingCenter
5. Event detected -> ClaimCenter FNOL
6. Fraud scoring -> ML service
7. Payout executed -> payment gateway

### IRDAI Compliance Enforcement

RakshaRide enforces compliance at the system level, ensuring auditability and regulatory alignment.

| Regulation Area | System Enforcement | Implementation |
|---|---|---|
| KYC / AML | Mandatory verification before policy issuance | Aadhaar/PAN API + pre-bind validation |
| Claim Settlement | Automated SLA timers and escalation workflows | ClaimCenter lifecycle rules |
| Auditability | Traceable logs for every claim decision | Event logs + audit trails |
| Pricing Governance | Actuarial justification for premiums | Rating engine with loss ratio tracking |
| Data Privacy | Secure storage and access control | Encryption + role-based access |

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

- Website: https://raksha-ride.vercel.app/
- Demo video:https://youtu.be/fXFalfp_7NA?si=Xr1wwxWuCuQ--4ba
- Architecture diagram: https://github.com/user-attachments/assets/9107d99c-d7ef-4b40-bc98-940dc99d9e12
- Workflow diagram: https://github.com/user-attachments/assets/97824b2b-dddb-4aa1-9db9-ee80a4e600ad
