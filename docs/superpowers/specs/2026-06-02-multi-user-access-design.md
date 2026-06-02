# Multi-User Access Control — Design Spec
_2026-06-02_

## Goal

Allow multiple users to access the Swing Trainer app with a request-then-approve flow. Users sign in with Google, land on a waiting screen, and the admin approves or rejects them from an in-app admin panel. Email notifications keep both sides informed without manual checking.

---

## Approach

DB-backed approval flow. A new `access_requests` table tracks every signup attempt. The Google OAuth callback sets a session for everyone (including pending users) and the frontend routes to the correct page based on status returned from `/api/me`. Gmail SMTP sends notifications in both directions. No data migration required — existing `ALLOWED_EMAILS` env var remains as a permanent bypass so the admin's own account is unaffected.

---

## Auth Flow

```
User clicks "Sign in with Google"
  ↓
Google OAuth callback fires
  ↓
  ├─ email == ADMIN_EMAIL (env var)?       → set session (status=admin)  → redirect to /
  ├─ email in ALLOWED_EMAILS (env var)?    → set session (status=active) → redirect to /
  ├─ AccessRequest.status == approved?     → set session (status=active) → redirect to /
  ├─ AccessRequest.status == pending?      → set session (status=pending)→ redirect to /
  ├─ AccessRequest.status == rejected?     → set session (status=rejected)→ redirect to /
  └─ No AccessRequest exists?              → create AccessRequest(pending)
                                           → email ADMIN_EMAIL notification
                                           → set session (status=pending) → redirect to /
```

`/api/me` reads the session email and resolves status by checking (in order): `ADMIN_EMAIL`, `ALLOWED_EMAILS`, `AccessRequest.status`. Returns `{ email, status, name }`.

Frontend gates based on status:

| Status | Page shown |
|---|---|
| 401 (no session) | `Login` — "Sign in with Google" |
| `pending` | `Pending` — "Your request has been submitted" |
| `rejected` | `Rejected` — "Access was not approved" |
| `active` + no User row | `Onboarding` — user fills in their own profile |
| `active` + User row | Full app |
| `admin` | Full app + Admin link in nav |

---

## Data Model

### New: `AccessRequest`

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `email` | String, unique, not null | Google OAuth email |
| `name` | String, nullable | From Google `userinfo.name` |
| `status` | String, not null, default `pending` | `pending` \| `approved` \| `rejected` |
| `requested_at` | DateTime | Set on first request |
| `reviewed_at` | DateTime, nullable | Set when admin approves or rejects |

No changes to the `User` model. `AccessRequest` handles access gating only — the `User` row is still created by Onboarding after first approved login.

Migration added to the existing `main.py` lifespan block using `CREATE TABLE IF NOT EXISTS`.

---

## Backend Components

### `backend/services/email.py` (new)

Two functions using `smtplib` + Gmail SMTP (`smtp.gmail.com:587`, STARTTLS):

- `send_access_request_notification(email, name)` — notifies `ADMIN_EMAIL`: "New access request from `<name>` (`<email>`). Log in to approve."
- `send_approval_notification(email)` — notifies requester: "Your access has been approved. Sign in at `<app URL>`."

Both functions are no-ops (log warning) if `GMAIL_USER` or `GMAIL_APP_PASSWORD` env vars are missing. Email failures never propagate — caught and logged, flow continues.

### `backend/routers/auth.py` — changes

1. `auth_callback`: Replace hard `ALLOWED_EMAILS` check with the full status logic. Always sets `request.session["email"]`. Creates `AccessRequest` for new users. Fires `send_access_request_notification` on first request.
2. New `GET /api/me`: Returns `{ email, status, name }` by reading session email and resolving status from `ADMIN_EMAIL` → `ALLOWED_EMAILS` → `AccessRequest`. Returns 401 if no session.

### `backend/auth.py` — changes

1. Add `ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")`.
2. `get_current_user`: Remove "claim unlinked user" hack. If session email has no `User` row, raise `HTTP 404` cleanly — the frontend handles this by showing Onboarding.
3. New `get_admin_user` dependency: reads session email, raises `HTTP 403` if it does not equal `ADMIN_EMAIL`.

### `backend/routers/admin.py` (new)

All three endpoints use `get_admin_user` dependency:

- `GET /api/admin/requests` — returns all `AccessRequest` rows sorted by `requested_at` desc, grouped by status in the response (`{ pending: [...], approved: [...], rejected: [...] }`)
- `POST /api/admin/requests/{id}/approve` — sets `status=approved`, sets `reviewed_at=now`, calls `send_approval_notification`, returns updated request
- `POST /api/admin/requests/{id}/reject` — sets `status=rejected`, sets `reviewed_at=now`, returns updated request

### `backend/main.py` — changes

1. Add `CREATE TABLE IF NOT EXISTS access_requests` migration in lifespan.
2. Include `admin` router.

---

## Frontend Components

### `frontend/src/context/UserContext.jsx` — simplified

Remove: `users` state, `switchUser`, `addUser`, `sessionEmail`.

New shape:
```js
{ user, status, loading, refreshUser }
```

On mount: single `GET /api/me` call. If 401 → `status = null` (shows Login). Otherwise sets `status` and, if `status` is `active` or `admin`, loads the current user via `GET /api/users/me`.

`refreshUser()` re-runs the same sequence — called by Onboarding after profile creation.

### `backend/routers/users.py` — one change

Add `GET /api/users/me` endpoint (requires auth): returns the `User` row for the session email, or 404 if not yet created. Replaces `GET /api/users/` as the way the frontend loads the current user.

### New frontend pages

**`frontend/src/components/Pending.jsx`**

Shown when `status === "pending"`. Displays the user's email and a message that they'll be notified when approved. Sign-out link.

**`frontend/src/components/Rejected.jsx`**

Shown when `status === "rejected"`. Brief message: access was not approved. Sign-out link.

**`frontend/src/pages/Admin.jsx`**

Shown only when `status === "admin"`. Fetches `GET /api/admin/requests`. Renders three sections (Pending / Approved / Rejected). Pending requests each have Approve and Reject buttons that call the corresponding endpoints and refresh the list.

### `frontend/src/App.jsx` — changes

New routing logic in `AppShell`:

```
loading         → spinner
status === null → <Login />
status === pending  → <Pending />
status === rejected → <Rejected />
!user           → <Onboarding />   (active/admin but no User row yet)
else            → full app shell
```

Admin link in `Sidebar` and `BottomNav` rendered only when `status === "admin"`.

### `frontend/src/components/Onboarding.jsx` — one change

After `POST /api/users/` succeeds, call `refreshUser()` from `UserContext` instead of the old `addUser()`.

---

## Environment Variables

Three new vars to add in Railway:

| Variable | Example | Purpose |
|---|---|---|
| `ADMIN_EMAIL` | `hernan.rosenblum89@gmail.com` | Admin Google email — always allowed in, can access `/admin` |
| `GMAIL_USER` | `hernan.rosenblum89@gmail.com` | Gmail address used to send notifications |
| `GMAIL_APP_PASSWORD` | `xxxx xxxx xxxx xxxx` | Gmail App Password (16 chars, generated at myaccount.google.com/apppasswords) |

`ALLOWED_EMAILS` remains in Railway unchanged — acts as permanent bypass for backward compatibility.

---

## Files Changed

| File | Change |
|---|---|
| `backend/models.py` | Add `AccessRequest` model |
| `backend/main.py` | Add migration + include admin router |
| `backend/auth.py` | Add `ADMIN_EMAIL`, `get_admin_user`; fix `get_current_user` |
| `backend/routers/auth.py` | Rewrite `auth_callback`; add `GET /api/me` |
| `backend/routers/users.py` | Add `GET /api/users/me` |
| `backend/routers/admin.py` | New — 3 admin endpoints |
| `backend/services/email.py` | New — Gmail SMTP service |
| `frontend/src/context/UserContext.jsx` | Simplify to status-based flow |
| `frontend/src/App.jsx` | Route by status; admin nav link |
| `frontend/src/components/Pending.jsx` | New — waiting screen |
| `frontend/src/components/Rejected.jsx` | New — rejected screen |
| `frontend/src/pages/Admin.jsx` | New — admin panel |
| `frontend/src/components/Onboarding.jsx` | Call `refreshUser()` after creation |

---

## Out of Scope

- User management by admin (resetting accounts, deleting users)
- Email address change after onboarding
- Role system beyond admin / regular user
- Pagination on admin request list
