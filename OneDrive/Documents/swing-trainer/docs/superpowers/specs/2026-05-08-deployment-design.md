# SwingTrainer Deployment Design Spec
**Date:** 2026-05-08
**Project:** `OneDrive/Documents/swing-trainer/`
**Author:** Hernan Rosenblum

---

## 1. Goal

Deploy SwingTrainer to the cloud so it is accessible from both a desktop browser and an iPhone. The iPhone experience uses Safari's "Add to Home Screen" PWA install for a native-app feel; Chrome on iPhone also works as a standard website. A custom domain provides a clean, memorable URL.

**Budget ceiling:** $20/month total (hosting + Anthropic API + domain + all accounts).

---

## 2. High-Level Architecture

```
GitHub repo (main branch)
       │
       │  git push → Railway auto-deploy
       ▼
┌──────────────────────────────────────┐
│  Railway Service                     │
│                                      │
│  Docker (multi-stage build)          │
│  ┌──────────────────────────────┐    │
│  │  Stage 1: Node 20            │    │
│  │  npm ci + vite build         │    │
│  │  → frontend/dist/            │    │
│  └──────────────────────────────┘    │
│  ┌──────────────────────────────┐    │
│  │  Stage 2: Python 3.13        │    │
│  │  pip install requirements    │    │
│  │  uvicorn backend.main:app    │    │
│  │  serves /api/* /auth/* /     │    │
│  └──────────────────────────────┘    │
│                                      │
│  Railway Volume → /data              │
│  /data/swing-trainer.db             │
└──────────────────────────────────────┘
       │
       │  HTTPS (Railway auto-cert via Let's Encrypt)
       │  Custom domain: yourdomain.com
       ▼
  iPhone Safari (PWA) / iPhone Chrome (website) / Desktop Browser
```

**One Railway service. One persistent volume. One domain. One deploy pipeline.**

Vite never runs in production. It builds once at Docker image build time. FastAPI serves the resulting static files alongside the API.

---

## 3. Authentication — Google OAuth with Email Allowlist

### 3.1 One-Time Setup (Google Cloud Console)

Before writing any code:

1. Create a Google Cloud project
2. Enable the Google OAuth 2.0 API
3. Create OAuth 2.0 credentials → get `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
4. Register authorized redirect URIs:
   - `https://yourdomain.com/auth/callback` (production)
   - `http://localhost:7432/auth/callback` (local dev)

### 3.2 Auth Flow

```
User visits yourdomain.com
        │
        ▼
FastAPI checks session cookie
        │
   ┌────┴────┐
   │ valid?  │
   └────┬────┘
    no  │  yes
        │   └──► serve app normally
        ▼
React renders <Login /> screen
"Sign in with Google" button
        │
        ▼
Browser → GET /auth/login
        │
        ▼
FastAPI builds Google OAuth URL
redirects → accounts.google.com
        │
        ▼
User signs in (or Google shows "Continue as Hernan")
        │
        ▼
Google → GET /auth/callback?code=...
        │
        ▼
FastAPI exchanges code for Google token
fetches user email from Google
checks email against ALLOWED_EMAILS env var
        │
   ┌────┴────┐
   │allowed? │
   └────┬────┘
    no  │  yes
    │   └──► set HTTP-only session cookie (30-day expiry)
    │        redirect → /
    │
    ▼
return 403 Forbidden page
```

### 3.3 Session Management

- Starlette's built-in `SessionMiddleware` (no extra dependency — ships with FastAPI)
- Session data stored in a signed, HTTP-only cookie using `SESSION_SECRET` env var
- Cookie expires after 30 days
- All `/api/*` routes protected by a FastAPI dependency that reads the session; returns `401` if no valid session
- `/auth/*` routes and static file serving are exempt from auth

### 3.4 Access Control

`ALLOWED_EMAILS` is a comma-separated environment variable on Railway:

```
ALLOWED_EMAILS=hernan.rosenblum89@gmail.com
```

To add another person later: update the env var in Railway dashboard, restart the service. No code change, no redeploy.

### 3.5 New FastAPI Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/login` | Redirect to Google OAuth |
| GET | `/auth/callback` | Exchange code, verify email, set cookie, redirect to `/` |
| GET | `/auth/logout` | Clear session cookie, redirect to `/` |

### 3.6 Local Development Bypass

`DEV_BYPASS_AUTH=true` in the local `.env` disables all auth checks. The app behaves exactly as it does today — no Google login, no cookies. This env var is never set on Railway.

---

## 4. Serving Model

FastAPI handles all traffic through a single process:

```
Request comes in
        │
        ├─ /auth/*        → Google OAuth routes (exempt from session check)
        ├─ /api/*         → API routes (session-protected)
        ├─ /health        → health check endpoint (Railway liveness probe)
        └─ everything else → frontend/dist/index.html
                             (React Router handles client-side routing)
```

`StaticFiles(directory="frontend/dist", html=True)` is mounted last. The `html=True` flag returns `index.html` for any path that doesn't match a file on disk, which is what makes React Router work correctly when navigating directly to `/train`, `/journal`, etc.

**CORS in production:** not needed. React and the API share the same origin. The existing CORS config (`allow_origins=["http://localhost:5173"]`) is kept for local dev only; the production build adds no CORS headers.

---

## 5. PWA — iPhone Home Screen

### 5.1 New Files

**`frontend/public/manifest.json`**

Standard PWA manifest. `"display": "standalone"` removes Safari browser chrome when the app is launched from the home screen.

```json
{
  "name": "SwingTrainer",
  "short_name": "SwingTrainer",
  "description": "Swing trading training platform",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f1117",
  "theme_color": "#0f1117",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**`frontend/public/icons/`**

Three PNG icons generated during implementation:
- `icon-192.png` — standard PWA icon
- `icon-512.png` — high-res PWA icon
- `apple-touch-icon.png` — 180×180, appears on iPhone home screen

Design: "ST" monogram on the app's dark background (`#0f1117`), matching existing color scheme.

**`frontend/public/sw.js`**

Minimal service worker. Caches the app shell (HTML, JS, CSS) on first load for fast subsequent opens. Never caches `/api/*` responses — data always comes from the network.

### 5.2 Changes to `frontend/index.html`

Add PWA meta tags and Apple-specific tags:
```html
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="SwingTrainer">
<meta name="theme-color" content="#0f1117">
```

Register the service worker via a `<script>` tag at the bottom of `<body>`.

### 5.3 Install Instructions (for Hernan)

1. Open Safari on iPhone → navigate to `https://yourdomain.com`
2. Sign in with Google (one time only)
3. Tap the Share button (box with arrow) → "Add to Home Screen" → "Add"
4. SwingTrainer icon appears on home screen
5. Tap it — opens fullscreen, no browser bars

Chrome on iPhone: visit the URL, use as a regular website. Same data, same functionality, browser bar always visible.

---

## 6. Data Persistence

SQLite remains the database. No migration to Postgres needed.

### 6.1 Railway Persistent Volume

- Mount path: `/data`
- The SQLite file lives at `/data/swing-trainer.db`
- Persists across deploys, restarts, and container replacements
- Cost: $0.25/GB/month — negligible for personal use

### 6.2 DATABASE_URL

`backend/database.py` changes from a hardcoded path to an env var with a local fallback:

```python
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./swing-trainer.db")
```

| Environment | Value |
|-------------|-------|
| Local dev | `sqlite:///./swing-trainer.db` (relative, in project root — default, no .env change needed) |
| Production | `sqlite:////data/swing-trainer.db` (absolute path to volume — set in Railway dashboard) |

### 6.3 Backups

No automated backup in this phase. Manual backup via:

```bash
railway run -- sqlite3 /data/swing-trainer.db .dump > backup-$(date +%Y%m%d).sql
```

Run this from your terminal before any significant update. Automated backup can be added as a Phase 2 task if desired.

---

## 7. CI/CD — Deploy Pipeline

### 7.1 Workflow

```
git push origin main
        │
        ▼
Railway detects push via GitHub webhook
        │
        ▼
Railway builds Docker image
  Stage 1: npm ci + vite build   (~60s)
  Stage 2: pip install           (~60s)
        │
        ▼
Health check passes (/health returns 200)
        │
        ▼
New container goes live — zero downtime
Total deploy time: ~2–3 minutes
```

### 7.2 Dockerfile

```dockerfile
# Stage 1: build the React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: run the Python backend
FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY conftest.py ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

ENV PORT=8000
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port $PORT"]
```

Railway injects `PORT` automatically. The SQLite volume is configured in the Railway dashboard (mount path `/data`) — not in the Dockerfile.

### 7.3 railway.json

```json
{
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### 7.4 Branch Strategy

- `main` → production, auto-deploys on every push
- Feature branches → local dev, merge to `main` when ready
- No staging environment — unnecessary for a personal app

---

## 8. Environment Variables

### 8.1 Railway Dashboard (production)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | `sqlite:////data/swing-trainer.db` |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `SESSION_SECRET` | Long random string — signs session cookies |
| `ALLOWED_EMAILS` | `hernan.rosenblum89@gmail.com` (comma-separated to add more) |
| `ANTHROPIC_API_KEY` | Existing key from .env.example |

### 8.2 Local `.env` (gitignored)

```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=123456.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
SESSION_SECRET=any-string-works-locally
ALLOWED_EMAILS=hernan.rosenblum89@gmail.com
DEV_BYPASS_AUTH=true
```

`DEV_BYPASS_AUTH=true` means Google credentials are never used locally — they just need to be present so the app doesn't crash on startup. The actual values don't matter for local dev.

---

## 9. Full File Inventory

### New files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: Vite → Python |
| `railway.json` | Health check + restart policy |
| `backend/routers/auth.py` | Google OAuth routes (login, callback, logout) |
| `frontend/public/manifest.json` | PWA manifest |
| `frontend/public/sw.js` | Service worker |
| `frontend/public/icons/icon-192.png` | PWA icon |
| `frontend/public/icons/icon-512.png` | PWA icon |
| `frontend/public/icons/apple-touch-icon.png` | iPhone home screen icon |
| `frontend/src/components/Login.jsx` | "Sign in with Google" screen |

### Modified files

| File | Change |
|------|--------|
| `backend/main.py` | Add `SessionMiddleware`, `StaticFiles`, auth router; update CORS |
| `backend/database.py` | `DATABASE_URL` from `os.getenv()` |
| `backend/requirements.txt` | Add `authlib` |
| `frontend/index.html` | PWA meta tags + service worker registration |
| `frontend/src/context/UserContext.jsx` | Handle 401 → show Login component |
| `frontend/vite.config.js` | Proxy `/auth/*` to backend |

### Unchanged

Everything in `backend/models.py`, `backend/schemas.py`, `backend/routers/users.py`, `tests/`, and all `frontend/src/pages/*` and `frontend/src/components/Onboarding.jsx` and `Sidebar.jsx` is untouched.

---

## 10. Cost Estimate

| Item | Cost |
|------|------|
| Railway service (small personal app) | ~$0–2/month |
| Railway volume (<100MB SQLite) | <$0.03/month |
| Custom domain | ~$1/month (billed ~$12/year) |
| Google OAuth | Free |
| Anthropic API (personal training use, Phases 1–2) | ~$3–10/month |
| **Total** | **~$4–13/month** |

Well within $20/month with headroom for heavier Anthropic usage as Phases 2–4 come online.

---

## 11. Out of Scope (this phase)

- Automated database backups
- Staging/preview environments
- Push notifications (future consideration for drill reminders)
- Android support
- Custom domain email (e.g. hernan@yourdomain.com)
- Any changes to existing API endpoints, models, or frontend pages

---

## 12. Success Criteria

The deployment is complete when:

1. `https://yourdomain.com` loads SwingTrainer in a desktop browser
2. Google sign-in works and gates access to the app
3. A second email is blocked with a 403
4. The iPhone home screen icon launches SwingTrainer fullscreen in standalone mode
5. Data entered on desktop is immediately visible on iPhone (same DB)
6. `git push origin main` deploys a new version within 3 minutes without manual steps
7. Local dev (`npm run dev` + `uvicorn`) works exactly as before Phase 1.5
