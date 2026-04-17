# RakshaRide Frontend (React + Vite)

This frontend implements core user flows for the RakshaRide prototype:

1. Delivery partner registration
2. Policy plan subscription
3. Claim submission
4. Policy/claim tracking dashboard
5. Admin dashboard access gate (`/admin`) via `VITE_ADMIN_ACCESS_KEY`

## Tech Stack

- React (Vite)
- React Router
- Custom CSS styling (`src/index.css`)

## Setup

```bash
cd frontend
npm install
npm run dev
```

Default app URL: `http://localhost:5173`

## Available Scripts

```bash
npm run dev
npm run build
npm run preview
```

## API Configuration

- In development, Vite proxy routes:
  - `/api` -> `http://localhost:5000`
  - `/ai` -> `http://localhost:5001`
- For deployed environments, set values in `frontend/.env`:
  - `VITE_API_BASE_URL`
  - `VITE_AI_BASE_URL`
  - `VITE_RAZORPAY_KEY_ID`
  - `VITE_ADMIN_ACCESS_KEY`
- If the frontend is deployed separately from the backend, `VITE_API_BASE_URL` must be an absolute backend URL, not `/api`.

