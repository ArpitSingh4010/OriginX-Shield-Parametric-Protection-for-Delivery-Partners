# GigShield Frontend (React + Tailwind CSS)

This frontend implements core user flows for the GigShield prototype:

1. Delivery partner registration
2. Policy plan subscription
3. Claim submission
4. Policy/claim tracking dashboard
5. Validation + loading + error feedback UX

## Tech Stack

- React (Vite)
- Tailwind CSS
- Vitest + React Testing Library

## Setup

```bash
cd frontend
npm install
npm run dev
```

Default app URL: `http://localhost:5173`

## Build & Test

```bash
npm run test
npm run build
```

## API Configuration

- Set backend base URL in app header (default `http://localhost:5000/api`)
- Optional: Request auth token from `/api/auth/token` and reuse it automatically for protected endpoints when backend auth enforcement is enabled.
