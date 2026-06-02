# Multi-User Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a request-then-approve user flow so multiple people can use the app — new users sign in with Google, land on a waiting screen, and the admin approves them from an in-app admin panel with Gmail notifications in both directions.

**Architecture:** A new `AccessRequest` table gates all non-admin logins. The OAuth callback always sets a session and creates an AccessRequest for unknown users. `/api/me` resolves `status` (admin | active | pending | rejected) by checking ADMIN_EMAIL → ALLOWED_EMAILS → AccessRequest. The frontend routes based on that status. The existing ALLOWED_EMAILS env var keeps working as a permanent bypass so the admin's account is unaffected.

**Tech Stack:** FastAPI + SQLAlchemy (SQLite), Authlib (Google OAuth), smtplib (Gmail SMTP), React + Vite.

---

## File Map

| File | Change |
|---|---|
| `backend/models.py` | Add `AccessRequest` model |
| `backend/auth.py` | Add `ADMIN_EMAIL`, `get_admin_user`; clean up `get_current_user` |
| `backend/main.py` | Add `_resolve_me_status` helper + expand `/api/me` + include admin router |
| `backend/routers/auth.py` | Rewrite `auth_callback` to use AccessRequest flow |
| `backend/routers/users.py` | Add `GET /users/me` endpoint |
| `backend/routers/admin.py` | New — list/approve/reject endpoints |
| `backend/services/email.py` | New — Gmail SMTP service |
| `frontend/src/api.js` | Add `NotFoundError`, `api.users.current`, `api.admin.*` |
| `frontend/src/context/UserContext.jsx` | Simplify to status-based flow; expose `email`, `refreshUser` |
| `frontend/src/App.jsx` | Route by status; add Admin route |
| `frontend/src/components/Pending.jsx` | New — waiting screen |
| `frontend/src/components/Rejected.jsx` | New — rejected screen |
| `frontend/src/pages/Admin.jsx` | New — admin panel |
| `frontend/src/components/Onboarding.jsx` | Use `refreshUser()` instead of `addUser()` |
| `frontend/src/components/Sidebar.jsx` | Remove user-switcher; add Admin link for admin status |
| `frontend/src/components/BottomNav.jsx` | Add Admin item to More sheet for admin status |
| `tests/test_access_request.py` | New — model + email service tests |
| `tests/test_auth.py` | Add `/api/me` status resolution tests |
| `tests/test_admin.py` | New — admin endpoint tests |

---

## Task 1: AccessRequest model + email service

**Files:**
- Modify: `backend/models.py`
- Create: `backend/services/email.py`
- Create: `tests/test_access_request.py`

- [ ] **Step 1: Write two failing tests in `tests/test_access_request.py`**

```python
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.database import Base
from backend.models import AccessRequest

TEST_DB_URL = "sqlite://"
_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


def test_access_request_defaults_to_pending():
    db = _Session()
    req = AccessRequest(email="test@example.com", name="Test User",
                        requested_at=datetime.now(timezone.utc))
    db.add(req)
    db.commit()
    db.refresh(req)
    assert req.id is not None
    assert req.status == "pending"
    assert req.reviewed_at is None
    db.close()


def test_email_service_is_noop_without_config(monkeypatch):
    import backend.services.email as email_svc
    monkeypatch.setattr(email_svc, "GMAIL_USER", "")
    monkeypatch.setattr(email_svc, "GMAIL_APP_PASSWORD", "")
    # must not raise
    email_svc.send_access_request_notification("user@example.com", "User")
    email_svc.send_approval_notification("user@example.com")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/test_access_request.py -v 2>&1 | tail -15
```

Expected: FAIL — `AccessRequest` not defined, `email_svc` module not found.

- [ ] **Step 3: Add `AccessRequest` model to `backend/models.py`**

After the `User` class (after the `question_mastery` relationship and `active_skills_list` property), add:

```python
class AccessRequest(Base):
    __tablename__ = "access_requests"
    id           = Column(Integer, primary_key=True)
    email        = Column(String, nullable=False, unique=True)
    name         = Column(String, nullable=True)
    status       = Column(String, nullable=False, default="pending")  # pending | approved | rejected
    requested_at = Column(DateTime, nullable=False)
    reviewed_at  = Column(DateTime, nullable=True)
```

- [ ] **Step 4: Create `backend/services/email.py`**

```python
import os
import smtplib
import logging
from email.mime.text import MIMEText

_log = logging.getLogger(__name__)

GMAIL_USER        = os.getenv("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
ADMIN_EMAIL       = os.getenv("ADMIN_EMAIL", "")
APP_URL           = os.getenv("APP_URL", "https://swing-trainer.up.railway.app")


def _send(to: str, subject: str, body: str) -> None:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        _log.warning("Email not configured — skipping send to %s", to)
        return
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"]    = GMAIL_USER
        msg["To"]      = to
        with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
            smtp.starttls()
            smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            smtp.sendmail(GMAIL_USER, to, msg.as_string())
    except Exception:
        _log.exception("Failed to send email to %s", to)


def send_access_request_notification(requester_email: str, requester_name: str) -> None:
    if not ADMIN_EMAIL:
        _log.warning("ADMIN_EMAIL not set — skipping access request notification")
        return
    _send(
        to=ADMIN_EMAIL,
        subject=f"SwingTrainer: New access request from {requester_name or requester_email}",
        body=(
            f"New access request:\n\n"
            f"Email: {requester_email}\n"
            f"Name:  {requester_name or '(not provided)'}\n\n"
            f"Log in to approve or reject:\n{APP_URL}/admin"
        ),
    )


def send_approval_notification(requester_email: str) -> None:
    _send(
        to=requester_email,
        subject="SwingTrainer: Your access has been approved",
        body=(
            f"Your access to SwingTrainer has been approved!\n\n"
            f"Sign in here: {APP_URL}\n\n"
            f"Complete your profile on first login."
        ),
    )
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/test_access_request.py -v 2>&1 | tail -10
```

Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add backend/models.py backend/services/email.py tests/test_access_request.py && git commit -m "feat: add AccessRequest model and Gmail email service"
```

---

## Task 2: Auth flow backend

**Files:**
- Modify: `backend/auth.py`
- Modify: `backend/routers/auth.py`
- Modify: `backend/main.py`
- Modify: `backend/routers/users.py`
- Modify: `tests/test_auth.py`

- [ ] **Step 1: Write three failing tests — append to `tests/test_auth.py`**

Read `tests/test_auth.py` first to understand the existing setup. Then append:

```python
from backend.models import AccessRequest
from backend.main import _resolve_me_status
from datetime import datetime, timezone
import backend.auth as auth_module_alias


def test_resolve_me_status_returns_admin_for_admin_email(monkeypatch):
    monkeypatch.setattr(auth_module_alias, "ADMIN_EMAIL", "admin@test.com")
    monkeypatch.setattr(auth_module_alias, "ALLOWED_EMAILS", set())
    db = _Session()
    Base.metadata.create_all(bind=_engine)
    result = _resolve_me_status("admin@test.com", db)
    db.close()
    assert result["status"] == "admin"


def test_resolve_me_status_returns_active_for_approved_request(monkeypatch):
    monkeypatch.setattr(auth_module_alias, "ADMIN_EMAIL", "admin@test.com")
    monkeypatch.setattr(auth_module_alias, "ALLOWED_EMAILS", set())
    db = _Session()
    Base.metadata.create_all(bind=_engine)
    db.add(AccessRequest(email="user@test.com", status="approved",
                         requested_at=datetime.now(timezone.utc)))
    db.commit()
    result = _resolve_me_status("user@test.com", db)
    db.close()
    assert result["status"] == "active"


def test_resolve_me_status_returns_pending_for_unknown_email(monkeypatch):
    monkeypatch.setattr(auth_module_alias, "ADMIN_EMAIL", "admin@test.com")
    monkeypatch.setattr(auth_module_alias, "ALLOWED_EMAILS", set())
    db = _Session()
    Base.metadata.create_all(bind=_engine)
    result = _resolve_me_status("nobody@test.com", db)
    db.close()
    assert result["status"] == "pending"
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/test_auth.py::test_resolve_me_status_returns_admin_for_admin_email tests/test_auth.py::test_resolve_me_status_returns_active_for_approved_request tests/test_auth.py::test_resolve_me_status_returns_pending_for_unknown_email -v 2>&1 | tail -15
```

Expected: FAIL — `_resolve_me_status` not importable, `ADMIN_EMAIL` not in auth module.

- [ ] **Step 3: Rewrite `backend/auth.py`**

Replace the entire file with:

```python
import os
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.database import get_db

DEV_BYPASS_AUTH = os.getenv("DEV_BYPASS_AUTH", "false").lower() == "true"
ALLOWED_EMAILS  = {e.strip() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()}
ADMIN_EMAIL     = os.getenv("ADMIN_EMAIL", "")


def require_auth(request: Request):
    if DEV_BYPASS_AUTH:
        return
    if not request.session.get("email"):
        raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_user(request: Request, db: Session = Depends(get_db)):
    from backend.models import User
    if DEV_BYPASS_AUTH:
        user = db.query(User).first()
        if not user:
            raise HTTPException(status_code=404, detail="No users found")
        return user
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User profile not found — complete onboarding first")
    return user


def get_admin_user(request: Request):
    if DEV_BYPASS_AUTH:
        return
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not ADMIN_EMAIL or email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access required")
```

- [ ] **Step 4: Rewrite `backend/routers/auth.py`**

Replace the entire file with:

```python
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from authlib.integrations.starlette_client import OAuth
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import AccessRequest
from backend.services.email import send_access_request_notification

router = APIRouter()

_oauth = OAuth()
_oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET", ""),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


@router.get("/auth/login")
async def auth_login(request: Request):
    redirect_uri = request.url_for("auth_callback")
    return await _oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/auth/callback", name="auth_callback")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    from backend.auth import ALLOWED_EMAILS, ADMIN_EMAIL
    token = await _oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo", {})
    email = userinfo.get("email", "")
    name  = userinfo.get("name", "")
    if not email:
        return RedirectResponse(url="/auth/forbidden", status_code=302)

    # Admin and legacy allowlist bypass the approval flow
    if email == ADMIN_EMAIL or email in ALLOWED_EMAILS:
        request.session["email"] = email
        return RedirectResponse(url="/", status_code=302)

    # Create AccessRequest for first-time users; leave existing ones alone
    req = db.query(AccessRequest).filter(AccessRequest.email == email).first()
    if req is None:
        req = AccessRequest(email=email, name=name, requested_at=datetime.now(timezone.utc))
        db.add(req)
        db.commit()
        send_access_request_notification(email, name)

    request.session["email"] = email
    return RedirectResponse(url="/", status_code=302)


@router.get("/auth/logout")
async def auth_logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/", status_code=302)


@router.get("/auth/forbidden")
async def auth_forbidden():
    return JSONResponse({"error": "Access denied."}, status_code=403)
```

- [ ] **Step 5: Add `_resolve_me_status` and update `/api/me` in `backend/main.py`**

First, add these imports near the top of `main.py` (after existing imports):

```python
from fastapi import FastAPI, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from backend.database import engine, get_db
```

(Note: `FastAPI`, `Depends`, `Request` are already imported — only `HTTPException`, `Session`, and `get_db` are new. Add only what's missing.)

Then, add `_resolve_me_status` as a module-level function just BEFORE the `app = FastAPI(...)` line:

```python
def _resolve_me_status(email: str, db: Session) -> dict:
    from backend.models import AccessRequest
    from backend.auth import ADMIN_EMAIL, ALLOWED_EMAILS
    if email == ADMIN_EMAIL:
        return {"email": email, "status": "admin", "name": ""}
    if email in ALLOWED_EMAILS:
        return {"email": email, "status": "active", "name": ""}
    req = db.query(AccessRequest).filter(AccessRequest.email == email).first()
    if req is None:
        return {"email": email, "status": "pending", "name": ""}
    name = req.name or ""
    if req.status == "approved":
        return {"email": email, "status": "active", "name": name}
    return {"email": email, "status": req.status, "name": name}
```

Then find the existing `/api/me` endpoint and replace it:

```python
@app.get("/api/me")
def get_me(request: Request, db: Session = Depends(get_db)):
    from backend.auth import DEV_BYPASS_AUTH
    if DEV_BYPASS_AUTH:
        return {"email": "dev@example.com", "status": "admin", "name": "Dev User"}
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _resolve_me_status(email, db)
```

- [ ] **Step 6: Add `GET /users/me` to `backend/routers/users.py`**

Read the file. Add this endpoint BEFORE `@router.get("/{user_id}", ...)` so FastAPI matches it first:

```python
@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return _to_response(current_user)
```

(Import `get_current_user` is already at the top of `users.py` from `backend.auth`.)

- [ ] **Step 7: Run the three new auth tests**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/test_auth.py -v 2>&1 | tail -15
```

Expected: all tests PASS (4 original + 3 new = 7 total).

- [ ] **Step 8: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add backend/auth.py backend/routers/auth.py backend/main.py backend/routers/users.py tests/test_auth.py && git commit -m "feat: rewrite auth flow with AccessRequest gating and /api/me status resolution"
```

---

## Task 3: Admin API

**Files:**
- Create: `backend/routers/admin.py`
- Modify: `backend/main.py`
- Create: `tests/test_admin.py`

- [ ] **Step 1: Write failing tests in `tests/test_admin.py`**

```python
import pytest
from datetime import datetime, timezone
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
from backend.auth import get_admin_user, require_auth
from backend.models import AccessRequest

TEST_DB_URL = "sqlite://"
_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def override_get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db]       = override_get_db
app.dependency_overrides[require_auth] = lambda: None
app.dependency_overrides[get_admin_user] = lambda: None


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


client = TestClient(app)


def _make_request(email="user@test.com", name="Test", status="pending"):
    db = _Session()
    req = AccessRequest(email=email, name=name, status=status,
                        requested_at=datetime.now(timezone.utc))
    db.add(req)
    db.commit()
    req_id = req.id
    db.close()
    return req_id


def test_list_requests_returns_empty_groups():
    resp = client.get("/api/admin/requests")
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"pending": [], "approved": [], "rejected": []}


def test_list_requests_groups_by_status():
    _make_request("a@test.com", status="pending")
    _make_request("b@test.com", status="approved")
    resp = client.get("/api/admin/requests")
    data = resp.json()
    assert len(data["pending"]) == 1
    assert len(data["approved"]) == 1
    assert data["pending"][0]["email"] == "a@test.com"


def test_approve_sets_status_and_sends_email():
    req_id = _make_request("notify@test.com")
    with patch("backend.routers.admin.send_approval_notification") as mock_send:
        resp = client.post(f"/api/admin/requests/{req_id}/approve")
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"
    mock_send.assert_called_once_with("notify@test.com")


def test_reject_sets_status():
    req_id = _make_request("reject@test.com")
    resp = client.post(f"/api/admin/requests/{req_id}/reject")
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"


def test_approve_unknown_id_returns_404():
    resp = client.post("/api/admin/requests/9999/approve")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/test_admin.py -v 2>&1 | tail -15
```

Expected: FAIL — admin router not registered, endpoints return 404.

- [ ] **Step 3: Create `backend/routers/admin.py`**

```python
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.auth import get_admin_user
from backend.models import AccessRequest
from backend.services.email import send_approval_notification

router = APIRouter(prefix="/admin")


def _serialize(r: AccessRequest) -> dict:
    return {
        "id": r.id,
        "email": r.email,
        "name": r.name,
        "status": r.status,
        "requested_at": r.requested_at.isoformat(),
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
    }


@router.get("/requests")
def list_requests(db: Session = Depends(get_db), _=Depends(get_admin_user)):
    reqs = db.query(AccessRequest).order_by(AccessRequest.requested_at.desc()).all()
    return {
        "pending":  [_serialize(r) for r in reqs if r.status == "pending"],
        "approved": [_serialize(r) for r in reqs if r.status == "approved"],
        "rejected": [_serialize(r) for r in reqs if r.status == "rejected"],
    }


@router.post("/requests/{request_id}/approve")
def approve_request(request_id: int, db: Session = Depends(get_db), _=Depends(get_admin_user)):
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status      = "approved"
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    send_approval_notification(req.email)
    return _serialize(req)


@router.post("/requests/{request_id}/reject")
def reject_request(request_id: int, db: Session = Depends(get_db), _=Depends(get_admin_user)):
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status      = "rejected"
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return _serialize(req)
```

- [ ] **Step 4: Register admin router in `backend/main.py`**

Add the import near the other router imports:

```python
from backend.routers import admin as admin_router
```

Add the `include_router` call after the other routers (no `require_auth` dependency — `get_admin_user` handles auth):

```python
app.include_router(admin_router.router, prefix="/api")
```

- [ ] **Step 5: Run admin tests**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/test_admin.py -v 2>&1 | tail -15
```

Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add backend/routers/admin.py backend/main.py tests/test_admin.py && git commit -m "feat: add admin API for listing and approving access requests"
```

---

## Task 4: Frontend — api.js + UserContext

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/context/UserContext.jsx`

- [ ] **Step 1: Update `frontend/src/api.js`**

Replace the entire file with:

```js
const BASE = '/api'

export class AuthError extends Error {
  constructor() { super('Not authenticated'); this.name = 'AuthError' }
}

export class NotFoundError extends Error {
  constructor() { super('Not found'); this.name = 'NotFoundError' }
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) throw new AuthError()
  if (res.status === 404) throw new NotFoundError()
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  me: () => request('GET', '/me'),
  users: {
    list:    ()         => request('GET',  '/users/'),
    create:  (body)     => request('POST', '/users/', body),
    get:     (id)       => request('GET',  `/users/${id}`),
    update:  (id, body) => request('PUT',  `/users/${id}`, body),
    skills:  (id)       => request('GET',  `/users/${id}/skills`),
    current: ()         => request('GET',  '/users/me'),
  },
  admin: {
    requests: ()   => request('GET',  '/admin/requests'),
    approve:  (id) => request('POST', `/admin/requests/${id}/approve`),
    reject:   (id) => request('POST', `/admin/requests/${id}/reject`),
  },
  trades: {
    list:    ()         => request('GET',  '/trades/'),
    open:    (body)     => request('POST', '/trades/', body),
    close:   (id, body) => request('PUT',  `/trades/${id}/close`, body),
    debrief: (id)       => request('POST', `/trades/${id}/ai-debrief`),
  },
  playbook: {
    setups:     ()         => request('GET',    '/playbook/setups'),
    rules:      (setup)    => request('GET',    `/playbook/rules${setup ? `?setup_type=${encodeURIComponent(setup)}` : ''}`),
    createRule: (body)     => request('POST',   '/playbook/rules', body),
    updateRule: (id, body) => request('PUT',    `/playbook/rules/${id}`, body),
    deleteRule: (id)       => request('DELETE', `/playbook/rules/${id}`),
  },
  progress: {
    stats:    () => request('GET',  '/progress/stats'),
    patterns: () => request('GET',  '/progress/patterns'),
    analyze:  () => request('POST', '/progress/analyze-patterns'),
    setups:   () => request('GET',  '/progress/setups'),
  },
  watchlist: {
    list:        ()            => request('GET',    '/watchlist/'),
    add:         (body)        => request('POST',   '/watchlist/', body),
    updateNotes: (id, notes)   => request('PUT',    `/watchlist/${id}/notes`, { notes }),
    updateTags:  (id, tags)    => request('PUT',    `/watchlist/${id}/tags`, { tags }),
    remove:      (id)          => request('DELETE', `/watchlist/${id}`),
  },
  market: {
    quote:   (symbol)            => request('GET', `/market/quote/${encodeURIComponent(symbol)}`),
    candles: (symbol, days = 60, date = null) =>
      request('GET', `/market/candles/${encodeURIComponent(symbol)}?days=${days}${date ? `&date=${date}` : ''}`),
    earnings: (symbol) => request('GET', `/market/earnings/${encodeURIComponent(symbol)}`),
  },
  curriculum: {
    list:    ()        => request('GET',    '/curriculum/'),
    check:   (item_id) => request('POST',   '/curriculum/check', { item_id }),
    uncheck: (item_id) => request('DELETE', `/curriculum/check/${encodeURIComponent(item_id)}`),
  },
  train: {
    today:        ()         => request('GET',  '/train/today'),
    generateRisk: ()         => request('GET',  '/train/risk-calc/generate'),
    submitRisk:   (body)     => request('POST', '/train/risk-calc/submit', body),
    submitQuiz:   (body)     => request('POST', '/train/quiz/submit', body),
    aiDrill:      (body)     => request('POST', '/train/ai-drill', body),
    getMastery:   (drillKey) => request('GET',  `/train/mastery/${encodeURIComponent(drillKey)}`),
    getAllMastery: ()         => request('GET',  '/train/mastery/all'),
  },
  tips: {
    daily:   ()     => request('GET',  '/tips/daily'),
    library: ()     => request('GET',  '/tips/library'),
    ask:     (body) => request('POST', '/tips/ask', body),
  },
}
```

- [ ] **Step 2: Rewrite `frontend/src/context/UserContext.jsx`**

Replace the entire file with:

```jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api, AuthError, NotFoundError } from '../api'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [status,  setStatus]  = useState(null)  // null | 'pending' | 'rejected' | 'active' | 'admin'
  const [email,   setEmail]   = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setStatus(me.status)
      setEmail(me.email)
      if (me.status === 'active' || me.status === 'admin') {
        try {
          const u = await api.users.current()
          setUser(u)
        } catch (e) {
          if (e instanceof NotFoundError) setUser(null)
          else throw e
        }
      }
    } catch (e) {
      if (e instanceof AuthError) { setStatus(null); setEmail(null) }
      else throw e
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function refreshUser() { load() }

  return (
    <UserContext.Provider value={{ user, status, email, loading, refreshUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (ctx === null) throw new Error('useUser must be used within a UserProvider')
  return ctx
}
```

- [ ] **Step 3: Build to verify no compile errors**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -10
```

Expected: build may fail with component errors (Onboarding/Sidebar reference removed context fields) — that's expected. The key check here is that `api.js` and `UserContext.jsx` themselves compile without syntax errors. If the error is only about `users`, `addUser`, `switchUser`, `sessionEmail` not found in those components, proceed — those get fixed in Task 7.

- [ ] **Step 4: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add frontend/src/api.js frontend/src/context/UserContext.jsx && git commit -m "feat: simplify UserContext to status-based flow; add admin and users.current to api"
```

---

## Task 5: Frontend — Pending + Rejected pages + App routing

**Files:**
- Create: `frontend/src/components/Pending.jsx`
- Create: `frontend/src/components/Rejected.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create `frontend/src/components/Pending.jsx`**

```jsx
import React from 'react'
import { useUser } from '../context/UserContext'

export default function Pending() {
  const { email } = useUser()
  return (
    <div className="onboarding">
      <h1>SwingTrainer</h1>
      <h2>Request submitted</h2>
      <p style={{ color: 'var(--text2)', fontSize: 14, textAlign: 'center', maxWidth: 320, margin: '0 auto 24px' }}>
        Your access request has been received.
        {email && <> We'll email <strong>{email}</strong> when it's approved.</>}
      </p>
      <a href="/auth/logout" style={{ color: 'var(--muted)', fontSize: 13 }}>Sign out</a>
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/Rejected.jsx`**

```jsx
import React from 'react'

export default function Rejected() {
  return (
    <div className="onboarding">
      <h1>SwingTrainer</h1>
      <h2>Access not approved</h2>
      <p style={{ color: 'var(--text2)', fontSize: 14, textAlign: 'center', maxWidth: 320, margin: '0 auto 24px' }}>
        Your access request was not approved. Contact the admin if you think this is a mistake.
      </p>
      <a href="/auth/logout" style={{ color: 'var(--muted)', fontSize: 13 }}>Sign out</a>
    </div>
  )
}
```

- [ ] **Step 3: Update `frontend/src/App.jsx`**

Read the file. Replace the entire file with:

```jsx
import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './context/UserContext'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import Onboarding from './components/Onboarding'
import Login from './components/Login'
import Pending from './components/Pending'
import Rejected from './components/Rejected'
import Home from './pages/Home'
import Train from './pages/Train'
import Journal from './pages/Journal'
import Playbook from './pages/Playbook'
import Watchlist from './pages/Watchlist'
import Progress from './pages/Progress'
import Tips from './pages/Tips'
import Curriculum from './pages/Curriculum'
import Admin from './pages/Admin'

function AppShell() {
  const { user, status, loading } = useUser()

  if (loading)                return <div className="loading">Loading…</div>
  if (status === null)        return <Login />
  if (status === 'pending')   return <Pending />
  if (status === 'rejected')  return <Rejected />
  if (!user)                  return <Onboarding />

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/"           element={<Home />} />
          <Route path="/train"      element={<Train />} />
          <Route path="/journal/*"  element={<Journal />} />
          <Route path="/playbook"   element={<Playbook />} />
          <Route path="/watchlist"  element={<Watchlist />} />
          <Route path="/progress"   element={<Progress />} />
          <Route path="/tips"       element={<Tips />} />
          <Route path="/curriculum" element={<Curriculum />} />
          {status === 'admin' && <Route path="/admin" element={<Admin />} />}
          <Route path="*"           element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <UserProvider>
      <AppShell />
    </UserProvider>
  )
}
```

- [ ] **Step 4: Build to verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -10
```

Build may still fail due to Onboarding/Sidebar/BottomNav referencing removed UserContext fields — that's fixed in Task 7. If it compiles except for those component errors, proceed. If `App.jsx`, `Pending.jsx`, or `Rejected.jsx` themselves have errors, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add frontend/src/components/Pending.jsx frontend/src/components/Rejected.jsx frontend/src/App.jsx && git commit -m "feat: add Pending and Rejected pages; route App by auth status"
```

---

## Task 6: Frontend — Admin page

**Files:**
- Create: `frontend/src/pages/Admin.jsx`

- [ ] **Step 1: Create `frontend/src/pages/Admin.jsx`**

```jsx
import React, { useState, useEffect } from 'react'
import { api } from '../api'

export default function Admin() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  async function load() {
    setLoading(true)
    try {
      setData(await api.admin.requests())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleApprove(id) { await api.admin.approve(id); load() }
  async function handleReject(id)  { await api.admin.reject(id);  load() }

  if (loading) return <div className="page"><div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div></div>
  if (error)   return <div className="page"><div style={{ color: 'var(--red)',   fontSize: 13 }}>Error: {error}</div></div>

  return (
    <div className="page">
      <h2 style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 24 }}>Admin — Access Requests</h2>

      <h3 style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Pending ({data.pending.length})
      </h3>
      {data.pending.length === 0 && (
        <div className="placeholder-card">No pending requests.</div>
      )}
      {data.pending.map(r => (
        <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>{r.name || r.email}</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {r.email} · {new Date(r.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleApprove(r.id)}
              style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Approve
            </button>
            <button onClick={() => handleReject(r.id)}
              style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--muted)', fontSize: 12, padding: '5px 14px', cursor: 'pointer' }}>
              Reject
            </button>
          </div>
        </div>
      ))}

      {data.approved.length > 0 && <>
        <h3 style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '24px 0 12px' }}>
          Approved ({data.approved.length})
        </h3>
        {data.approved.map(r => (
          <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
            <span style={{ color: 'var(--text)', fontSize: 13 }}>{r.name || r.email}</span>
            {r.name && <span style={{ color: 'var(--muted)', fontSize: 12 }}> ({r.email})</span>}
          </div>
        ))}
      </>}

      {data.rejected.length > 0 && <>
        <h3 style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '24px 0 12px' }}>
          Rejected ({data.rejected.length})
        </h3>
        {data.rejected.map(r => (
          <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
            <span style={{ color: 'var(--text)', fontSize: 13 }}>{r.name || r.email}</span>
            {r.name && <span style={{ color: 'var(--muted)', fontSize: 12 }}> ({r.email})</span>}
          </div>
        ))}
      </>}
    </div>
  )
}
```

- [ ] **Step 2: Build to verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -10
```

Expected: build may still fail due to Onboarding/Sidebar/BottomNav — fixed in Task 7. Admin.jsx itself should be error-free.

- [ ] **Step 3: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add frontend/src/pages/Admin.jsx && git commit -m "feat: add admin panel for managing access requests"
```

---

## Task 7: Frontend — Onboarding + Sidebar + BottomNav cleanup

**Files:**
- Modify: `frontend/src/components/Onboarding.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/components/BottomNav.jsx`

- [ ] **Step 1: Rewrite `frontend/src/components/Onboarding.jsx`**

Read the file. Replace the entire file with:

```jsx
import React, { useState } from 'react'
import { api } from '../api'
import { useUser } from '../context/UserContext'

const SKILLS = [
  { key: 'chart_reading',        label: 'Chart Reading',        desc: 'Key levels, trend structure, setup validity' },
  { key: 'entry_timing',         label: 'Entry Timing',         desc: 'Precision and confirmation of entries' },
  { key: 'risk_sizing',          label: 'Risk & Sizing',        desc: 'Position sizing, stop adherence' },
  { key: 'setup_selection',      label: 'Setup Selection',      desc: 'Avoiding low-quality setups' },
  { key: 'trade_management',     label: 'Trade Management',     desc: 'Holding through noise, managing exits' },
  { key: 'emotional_discipline', label: 'Emotional Discipline', desc: 'FOMO, revenge trading, execution' },
]

const STAGES = [
  { key: 'learning',    label: 'Still Learning',   desc: 'Not trading real money yet' },
  { key: 'small_money', label: 'Small Real Money', desc: 'Testing my edge with real stakes' },
  { key: 'active',      label: 'Active Trader',    desc: 'Trading regularly, scaling up' },
]

const BUDGETS = [
  { key: '15min', label: '15–20 min / day', desc: '1 drill + quick journal' },
  { key: '30min', label: '30–45 min / day', desc: '2 drills + learning module' },
  { key: '60min', label: '1 hour+ / day',   desc: 'Full session with chart study' },
]

export default function Onboarding() {
  const { email, refreshUser } = useUser()
  const [step,   setStep]   = useState('name')
  const [name,   setName]   = useState('')
  const [stage,  setStage]  = useState('')
  const [budget, setBudget] = useState('')
  const [skills, setSkills] = useState([])
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  function toggleSkill(key) {
    setSkills(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])
  }

  async function finish() {
    if (skills.length < 2) { setError('Select at least 2 skill areas'); return }
    setSaving(true)
    setError('')
    try {
      await api.users.create({
        name,
        trading_stage: stage,
        time_budget:   budget,
        active_skills: skills,
        email:         email || undefined,
      })
      refreshUser()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="onboarding">
      <h1>SwingTrainer</h1>

      {step === 'name' && (
        <div className="onboarding-step">
          <h2>What's your name?</h2>
          <input
            className="onb-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && name.trim() && setStep('stage')}
          />
          <button className="onb-btn" disabled={!name.trim()} onClick={() => setStep('stage')}>Next →</button>
        </div>
      )}

      {step === 'stage' && (
        <div className="onboarding-step">
          <h2>Where are you in your trading journey?</h2>
          {STAGES.map(s => (
            <div key={s.key} className={`onb-option${stage === s.key ? ' selected' : ''}`} onClick={() => setStage(s.key)}>
              <strong>{s.label}</strong><span>{s.desc}</span>
            </div>
          ))}
          <button className="onb-btn" disabled={!stage} onClick={() => setStep('budget')}>Next →</button>
        </div>
      )}

      {step === 'budget' && (
        <div className="onboarding-step">
          <h2>How much time can you give daily?</h2>
          {BUDGETS.map(b => (
            <div key={b.key} className={`onb-option${budget === b.key ? ' selected' : ''}`} onClick={() => setBudget(b.key)}>
              <strong>{b.label}</strong><span>{b.desc}</span>
            </div>
          ))}
          <button className="onb-btn" disabled={!budget} onClick={() => setStep('skills')}>Next →</button>
        </div>
      )}

      {step === 'skills' && (
        <div className="onboarding-step">
          <h2>Which areas do you want to develop?</h2>
          <p style={{ fontSize: '0.8em', color: 'var(--muted)', marginBottom: '4px' }}>Select 2–6</p>
          {SKILLS.map(s => (
            <div key={s.key} className={`onb-option${skills.includes(s.key) ? ' selected' : ''}`} onClick={() => toggleSkill(s.key)}>
              <strong>{s.label}</strong><span>{s.desc}</span>
            </div>
          ))}
          {error && <p className="onb-error">{error}</p>}
          <button className="onb-btn" disabled={saving} onClick={finish}>
            {saving ? 'Setting up…' : 'Start Training →'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `frontend/src/components/Sidebar.jsx`**

Read the file. Replace the entire file with:

```jsx
import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useUser } from '../context/UserContext'

const NAV = [
  { to: '/',          icon: '🏠', label: 'Home',       exact: true },
  { to: '/train',     icon: '🎯', label: 'Train' },
  { to: '/journal',   icon: '📓', label: 'Journal' },
  { to: '/playbook',  icon: '📋', label: 'Playbook' },
  { to: '/watchlist', icon: '👁️', label: 'Watchlist' },
  { to: '/progress',  icon: '📈', label: 'Progress' },
  { to: '/tips',      icon: '💡', label: 'Tips' },
  { to: '/curriculum',icon: '📚', label: 'Curriculum' },
]

export default function Sidebar() {
  const { status } = useUser()
  const location   = useLocation()
  const [analysisBadge, setAnalysisBadge] = useState(
    () => sessionStorage.getItem('analysis_available') === '1'
  )

  useEffect(() => {
    function onBadge() { setAnalysisBadge(true) }
    window.addEventListener('analysis-badge', onBadge)
    return () => window.removeEventListener('analysis-badge', onBadge)
  }, [])

  useEffect(() => {
    if (location.pathname === '/progress') {
      sessionStorage.removeItem('analysis_available')
      setAnalysisBadge(false)
    }
  }, [location.pathname])

  const allNav = [
    ...NAV,
    ...(status === 'admin' ? [{ to: '/admin', icon: '⚙️', label: 'Admin' }] : []),
  ]

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">SwingTrainer<span>v2.0</span></div>
      {allNav.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
          {item.to === '/progress' && analysisBadge && (
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', marginLeft: 6, verticalAlign: 'middle' }} />
          )}
        </NavLink>
      ))}
      <div className="sidebar-spacer" />
    </nav>
  )
}
```

- [ ] **Step 3: Update `frontend/src/components/BottomNav.jsx`**

Read the file. Replace the entire file with:

```jsx
import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useUser } from '../context/UserContext'

const PRIMARY = [
  { to: '/',          icon: '🏠', label: 'Home',      exact: true },
  { to: '/train',     icon: '🎯', label: 'Train' },
  { to: '/journal',   icon: '📓', label: 'Journal' },
  { to: '/watchlist', icon: '👁️', label: 'Watchlist' },
]

const MORE_BASE = [
  { to: '/progress',   icon: '📈', label: 'Progress' },
  { to: '/tips',       icon: '💡', label: 'Tips' },
  { to: '/playbook',   icon: '📋', label: 'Playbook' },
  { to: '/curriculum', icon: '📚', label: 'Curriculum' },
]

export default function BottomNav() {
  const { status } = useUser()
  const [moreOpen, setMoreOpen] = useState(false)
  const location  = useLocation()
  const navigate  = useNavigate()
  const [analysisBadge, setAnalysisBadge] = useState(
    () => sessionStorage.getItem('analysis_available') === '1'
  )

  useEffect(() => {
    function onBadge() { setAnalysisBadge(true) }
    window.addEventListener('analysis-badge', onBadge)
    return () => window.removeEventListener('analysis-badge', onBadge)
  }, [])

  useEffect(() => {
    if (location.pathname === '/progress') {
      sessionStorage.removeItem('analysis_available')
      setAnalysisBadge(false)
    }
    setMoreOpen(false)
  }, [location.pathname])

  const moreItems = [
    ...MORE_BASE,
    ...(status === 'admin' ? [{ to: '/admin', icon: '⚙️', label: 'Admin' }] : []),
  ]

  function goTo(to) { setMoreOpen(false); navigate(to) }

  return (
    <>
      {moreOpen && <div className="bottom-nav-backdrop" onClick={() => setMoreOpen(false)} />}
      {moreOpen && (
        <div className="bottom-nav-more-sheet">
          <div className="bottom-nav-more-handle" />
          {moreItems.map(item => (
            <button key={item.to} className="bottom-nav-more-item" onClick={() => goTo(item.to)}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.to === '/progress' && analysisBadge && <span className="bottom-nav-badge" />}
            </button>
          ))}
        </div>
      )}
      <nav className="bottom-nav">
        {PRIMARY.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </NavLink>
        ))}
        <button
          className={`bottom-nav-item${moreOpen ? ' active' : ''}`}
          onClick={() => setMoreOpen(o => !o)}
        >
          <span className="bottom-nav-icon">⋯</span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>
    </>
  )
}
```

- [ ] **Step 4: Build to verify — must pass cleanly**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -8
```

Expected: `✓ built` with no errors. All components now use the new UserContext shape.

- [ ] **Step 5: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add frontend/src/components/Onboarding.jsx frontend/src/components/Sidebar.jsx frontend/src/components/BottomNav.jsx && git commit -m "feat: update Onboarding, Sidebar, BottomNav for multi-user context"
```

---

## Task 8: Full test suite + build dist + deploy

- [ ] **Step 1: Run full test suite**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/ -v 2>&1 | tail -30
```

Expected: all tests PASS. If any test fails, fix it before proceeding.

- [ ] **Step 2: Build final frontend bundle**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 3: Commit dist and deploy**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add frontend/dist && git commit -m "chore: rebuild dist for multi-user access control deploy"
```

```bash
railway up --detach
```

- [ ] **Step 4: Add Railway env vars**

After deploy, add these three env vars in the Railway dashboard (Settings → Variables):

| Variable | Value |
|---|---|
| `ADMIN_EMAIL` | Your Google email (e.g. `hernan.rosenblum89@gmail.com`) |
| `GMAIL_USER` | Same Gmail address |
| `GMAIL_APP_PASSWORD` | 16-char app password from myaccount.google.com/apppasswords |

Railway will redeploy automatically after saving. `ALLOWED_EMAILS` stays as-is.
