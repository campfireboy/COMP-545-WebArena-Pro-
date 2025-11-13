## Spotify-like Streaming Prototype

This repo turns the project plan into a tangible full-stack MVP. It contains:

- **Frontend** – React + Vite single-page app with curated playlists, queue management, recommendation highlights, audio player, and feedback capture UI.
- **Backend** – Express API that serves songs, playlist metadata, personalized recommendations, health info, and feedback ingestion.
- **Database plan** – Cloud-hosted PostgreSQL (Neon) with schema + seed scripts, designed to scale toward the full Spotify-like roadmap.

### Tech Stack

| Layer     | Choice                          | Notes |
|-----------|---------------------------------|-------|
| Frontend  | React + Vite, CSS Modules       | SPA with responsive layout, auth widgets, HTML audio element |
| Backend   | Node.js (Express 5), CORS, dotenv, JWT | REST API w/ auth, profile, playlists, recommendations |
| Database  | **Neon serverless PostgreSQL**   | Free tier cloud Postgres, SSL required, schema + seed files included |

---

## Local Development

### 1. Backend (Express API)

```bash
cd server
npm install
cp .env.example .env               # add DATABASE_URL from Neon (or any Postgres)
# Fill in JWT_SECRET, OAuth keys (Google/Facebook), or keep demo OAuth enabled
npm run dev                        # starts on http://localhost:4000
```

### 2. Frontend (React app)

```bash
cd client
npm install
cp .env.example .env               # defaults to backend running on :4000
npm run dev                        # Vite dev server on http://localhost:5173
```

> **Node version**: Vite 7 expects Node >= 20.19.0. Upgrade if you see the warning during `npm install`/`npm run build`.

With both servers running, visit `http://localhost:5173` to use the app. The UI reads from `VITE_API_BASE_URL` and shows live API health, playlists, song queue, recommendations, and the feedback form backed by `/api/feedback`.

#### Frontend-only demo mode

If you just want to showcase the UI without standing up the backend, set `VITE_DEMO_MODE=true` inside `client/.env`. In demo mode:

- Songs, playlists, recommendations, and feedback are served from local sample data.
- A seeded account `demo@listener.fm / password123` is available, and you can register additional demo users (stored in `localStorage`).
- Password reset tokens are generated entirely in the browser for quick walkthroughs.

---

## Cloud Database Setup (Neon)

1. Create a free project at [https://neon.tech](https://neon.tech) and note the connection string (`postgres://...`).
2. Update `server/.env` with `DATABASE_URL=<neon connection>`. Keep `PG_SSL=true` (Neon requires SSL).
3. Initialize schema & sample content:

```bash
# Execute the SQL once to create tables
psql "$DATABASE_URL" -f server/db/schema.sql

# Seed the curated songs/playlists (optional but recommended)
cd server
npm run seed
```

The Express layer auto-detects whether `DATABASE_URL` is configured:

- **Configured** – queries live data from Neon.
- **Not configured / unreachable** – graceful fallback to `sampleData.js`, so the UI and API remain functional for demos.

---

## API Surface

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/health` | Environment + DB snapshot |
| POST   | `/api/auth/register` | Email/password registration (bcrypt + JWT) |
| POST   | `/api/auth/login` | Local login issuing JWT |
| POST   | `/api/auth/oauth/google` | Google Sign-In (uses `GOOGLE_CLIENT_ID`) |
| POST   | `/api/auth/oauth/facebook` | Facebook Login (needs `FACEBOOK_APP_ID` + secret) |
| POST   | `/api/auth/password/request` | Generates reset token (returns token in dev mode) |
| POST   | `/api/auth/password/reset` | Confirms token + sets new password |
| GET    | `/api/me` | Returns authenticated profile |
| PUT    | `/api/me` | Updates display name / avatar / bio |
| GET    | `/api/songs?genre=&search=&limit=` | Paginated songs filtered by genre/text |
| GET    | `/api/songs/:id` | Single song |
| GET    | `/api/playlists` | Editorial playlists grid |
| GET    | `/api/playlists/:id` | Playlist with ordered songs |
| GET    | `/api/users/:id/recommendations` | Lightweight personalization mock |
| POST   | `/api/feedback` | Captures feedback (in-memory today) |

All responses are JSON. When a Postgres connection is available, the same endpoints hydrate from the cloud database.

---

## Authentication & User Management

- **JWT Auth Flow** – Email/password registration + login using bcrypt hashing and JWT issuance (`JWT_SECRET`, `JWT_EXPIRES_IN`).
- **Profile Management** – Authenticated `/api/me` endpoints let users edit display name, avatar URL, and bio.
- **OAuth Providers (API optional)** – Google and Facebook endpoints remain on the API if you need them, but the default UI keeps the experience focused on email/password auth.
- **Password Reset** – `/api/auth/password/request` stores hashed reset tokens in Postgres (or in-memory fallback) and returns the plaintext token in non-production environments for easy testing.
- **Seeded Demo User** – `demo@listener.fm` / `password123` (premium tier) seeded via `npm run seed`.
- **Frontend Demo Mode** – Toggle `VITE_DEMO_MODE=true` to run the SPA against in-browser sample data, enabling login/profile/edit/feedback flows with zero backend dependencies.
- **Frontend Integration** – The React SPA exposes login/register toggles, profile editor, password reset workflow, and demo-mode data, persisting auth state in `localStorage` for quick testing.

---

## Project Structure

```
.
├── client/                # React UI (Vite)
│   ├── src/services/api.js
│   ├── src/App.jsx / App.css
│   └── .env.example
├── server/                # Express API
│   ├── src/routes/api.js
│   ├── src/services/*.js
│   ├── src/data/sampleData.js
│   ├── db/schema.sql
│   └── scripts/seed.js
└── Music-Streaming-Platform-Project-Plan.md
```

---

## Deployment Notes

- **Backend**: Deploy via Render/Fly/Heroku. Supply `DATABASE_URL`, `PG_SSL=true`, and set `ORIGIN` to the frontend URL for CORS.
- **Database**: Neon provides branching + autoscaling (1–3TB). For larger workloads or regional compliance, swap the connection string to RDS/TiDB without code changes.
- **Frontend**: `cd client && npm run build` emits static assets under `client/dist` ready for any CDN/host (Cloudflare Pages, Vercel, S3 + CloudFront, etc.).

These pieces line up with the project plan phases: requirements → architecture → development MVP → deployable artifact with a clear cloud data strategy.
