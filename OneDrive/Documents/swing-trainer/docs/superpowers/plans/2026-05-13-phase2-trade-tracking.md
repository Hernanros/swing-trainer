# Phase 2: Trade Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full trade tracking to SwingTrainer — open/close trades via a slide-in drawer, live Open Positions and This Week's Edge on the Home dashboard, and a trade log in the Journal.

**Architecture:** Backend adds a `trades` router (3 REST routes) plus a `get_current_user` dependency that identifies the session user. Frontend adds `TradeDrawer.jsx` used by `Journal.jsx`; `Home.jsx` fetches real trade data. All routes require auth (prod) or fall back to first DB user (dev).

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, SQLite, pytest; React 18, Vite, React Router v6

**Spec:** `docs/superpowers/specs/2026-05-12-phase2-trade-tracking-design.md`

**Run tests from project root:**
```bash
cd OneDrive/Documents/swing-trainer
pytest -v
```

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `backend/routers/trades.py` | GET /api/trades/, POST /api/trades/, PUT /api/trades/{id}/close |
| `frontend/src/components/TradeDrawer.jsx` | Slide-in open/close form |
| `tests/test_trades.py` | Trade route tests |

### Modified files
| File | Change |
|------|--------|
| `backend/models.py` | Add `email` column to `User` |
| `backend/auth.py` | Add `get_current_user(request, db)` dependency |
| `backend/schemas.py` | Add `TradeCreate`, `TradeClose`, `TradeResponse`; add `email` to `UserCreate` |
| `backend/routers/users.py` | Store `email` when creating user |
| `backend/main.py` | Inline migration; register trades router; add `GET /api/me` |
| `frontend/src/api.js` | Add `api.trades.*` and `api.me` |
| `frontend/src/context/UserContext.jsx` | Call `api.me` on load; expose `sessionEmail` |
| `frontend/src/pages/Journal.jsx` | Full trade log table + drawer |
| `frontend/src/pages/Home.jsx` | Live Open Positions + This Week's Edge cards |

---

## Task 1: Add `email` to User model + inline migration

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Add email column to User model**

In `backend/models.py`, add one line after `created_at`:

```python
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    trading_stage = Column(String, nullable=False)
    time_budget = Column(String, nullable=False)
    active_skills = Column(Text, nullable=False)
    email = Column(String, nullable=True, unique=True)   # ← add this line
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # ... relationships unchanged
```

- [ ] **Step 2: Add inline migration in main.py lifespan**

SQLite doesn't run `create_all` migrations on existing tables. Add an explicit `ALTER TABLE` that's safe to run on every startup:

```python
from sqlalchemy import text

@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(users)"))]
        if "email" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN email TEXT"))
            conn.commit()
    yield
```

Full updated `backend/main.py`:

```python
from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import text
from backend.database import engine
import backend.models as models  # noqa: F401
from backend.routers import users
from backend.routers import auth as auth_router
from backend.auth import require_auth

SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")
_DEV_MODE = os.getenv("DEV_BYPASS_AUTH", "false").lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(users)"))]
        if "email" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN email TEXT"))
            conn.commit()
    yield


app = FastAPI(title="SwingTrainer API", lifespan=lifespan)

app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, https_only=not _DEV_MODE)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"] if _DEV_MODE else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(users.router, prefix="/api", dependencies=[Depends(require_auth)])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/me")
def get_me(request: Request):
    email = request.session.get("email") if not _DEV_MODE else None
    return {"email": email}


_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
pytest tests/test_users.py tests/test_auth.py tests/test_db.py tests/test_schemas.py -v
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/models.py backend/main.py
git commit -m "feat: add User.email column with inline migration, add GET /api/me"
```

---

## Task 2: Add `get_current_user` dependency to auth.py

**Files:**
- Modify: `backend/auth.py`

- [ ] **Step 1: Add get_current_user to auth.py**

Full updated `backend/auth.py`:

```python
import os
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.database import get_db

DEV_BYPASS_AUTH = os.getenv("DEV_BYPASS_AUTH", "false").lower() == "true"
ALLOWED_EMAILS = {e.strip() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()}

if not DEV_BYPASS_AUTH and not ALLOWED_EMAILS:
    import warnings
    warnings.warn("ALLOWED_EMAILS is empty — all OAuth logins will be denied", stacklevel=1)


def require_auth(request: Request):
    if DEV_BYPASS_AUTH:
        return
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_user(request: Request, db: Session = Depends(get_db)):
    from backend.models import User  # local import to avoid circular
    if DEV_BYPASS_AUTH:
        user = db.query(User).first()
        if not user:
            raise HTTPException(status_code=404, detail="No users found")
        return user
    email = request.session.get("email")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

- [ ] **Step 2: Run existing tests**

```bash
pytest tests/ -v
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/auth.py
git commit -m "feat: add get_current_user dependency to auth.py"
```

---

## Task 3: Add Trade schemas + UserCreate email

**Files:**
- Modify: `backend/schemas.py`

- [ ] **Step 1: Add trade schemas and email to UserCreate**

Full updated `backend/schemas.py`:

```python
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

VALID_SKILLS = [
    "chart_reading",
    "entry_timing",
    "risk_sizing",
    "setup_selection",
    "trade_management",
    "emotional_discipline",
]

VALID_STAGES = ["learning", "small_money", "active"]
VALID_TIME_BUDGETS = ["15min", "30min", "60min"]

DRILLS_PER_DAY = {"15min": 1, "30min": 2, "60min": 3}


class UserCreate(BaseModel):
    name: str
    trading_stage: str
    time_budget: str
    active_skills: List[str]
    email: Optional[str] = None

    model_config = {"str_strip_whitespace": True}


class UserUpdate(BaseModel):
    name: Optional[str] = None
    trading_stage: Optional[str] = None
    time_budget: Optional[str] = None
    active_skills: Optional[List[str]] = None

    model_config = {"str_strip_whitespace": True}


class UserResponse(BaseModel):
    id: int
    name: str
    trading_stage: str
    time_budget: str
    active_skills: List[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class TradeCreate(BaseModel):
    symbol: str
    direction: str          # "long" | "short"
    entry_price: float
    stop_price: float
    target_price: float
    shares: int
    pre_note: str = ""

    model_config = {"str_strip_whitespace": True}


class TradeClose(BaseModel):
    exit_price: float
    debrief: str

    model_config = {"str_strip_whitespace": True}


class TradeResponse(BaseModel):
    id: int
    symbol: str
    direction: str
    entry_price: float
    stop_price: float
    target_price: float
    exit_price: Optional[float]
    shares: int
    status: str
    pre_note: str
    debrief: str
    pnl: Optional[float]
    r_multiple: Optional[float]
    created_at: datetime
```

- [ ] **Step 2: Run existing schema tests**

```bash
pytest tests/test_schemas.py tests/test_users.py -v
```

Expected: all pass. (`UserCreate` now accepts an optional `email` field — backwards compatible.)

- [ ] **Step 3: Commit**

```bash
git add backend/schemas.py
git commit -m "feat: add TradeCreate, TradeClose, TradeResponse schemas; add email to UserCreate"
```

---

## Task 4: Create trades router

**Files:**
- Create: `backend/routers/trades.py`

- [ ] **Step 1: Create `backend/routers/trades.py`**

```python
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Trade, User
from backend.schemas import TradeCreate, TradeClose, TradeResponse

router = APIRouter(prefix="/trades", tags=["trades"])


def _to_response(t: Trade) -> dict:
    return {
        "id":          t.id,
        "symbol":      t.symbol,
        "direction":   t.direction,
        "entry_price": t.entry,
        "stop_price":  t.stop,
        "target_price":t.target,
        "exit_price":  t.exit,
        "shares":      t.shares,
        "status":      t.status,
        "pre_note":    t.pre_note or "",
        "debrief":     t.debrief or "",
        "pnl":         t.pnl,
        "r_multiple":  t.r_multiple,
        "created_at":  t.created_at,
    }


@router.get("/", response_model=list[TradeResponse])
def list_trades(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trades = (
        db.query(Trade)
        .filter(Trade.user_id == current_user.id)
        .order_by(Trade.created_at.desc())
        .all()
    )
    return [_to_response(t) for t in trades]


@router.post("/", response_model=TradeResponse, status_code=201)
def open_trade(
    body: TradeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    symbol = body.symbol.upper().strip()
    if not symbol:
        raise HTTPException(400, "symbol is required")
    if body.direction not in ("long", "short"):
        raise HTTPException(400, "direction must be 'long' or 'short'")
    if body.entry_price <= 0 or body.stop_price <= 0 or body.target_price <= 0:
        raise HTTPException(400, "entry_price, stop_price, and target_price must be > 0")
    if body.shares < 1:
        raise HTTPException(400, "shares must be >= 1")
    if body.stop_price == body.entry_price:
        raise HTTPException(400, "stop_price must not equal entry_price")

    trade = Trade(
        user_id=current_user.id,
        symbol=symbol,
        direction=body.direction,
        entry=body.entry_price,
        stop=body.stop_price,
        target=body.target_price,
        shares=body.shares,
        pre_note=body.pre_note,
        status="open",
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        setup_type="",
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return _to_response(trade)


@router.put("/{trade_id}/close", response_model=TradeResponse)
def close_trade(
    trade_id: int,
    body: TradeClose,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trade = db.query(Trade).filter(
        Trade.id == trade_id,
        Trade.user_id == current_user.id,
    ).first()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status == "closed":
        raise HTTPException(400, "Trade is already closed")
    if body.exit_price <= 0:
        raise HTTPException(400, "exit_price must be > 0")
    if not body.debrief.strip():
        raise HTTPException(400, "debrief is required")

    exit_price = body.exit_price
    if trade.direction == "long":
        pnl = (exit_price - trade.entry) * trade.shares
        r_multiple = (exit_price - trade.entry) / (trade.entry - trade.stop)
    else:
        pnl = (trade.entry - exit_price) * trade.shares
        r_multiple = (trade.entry - exit_price) / (trade.stop - trade.entry)

    trade.exit = exit_price
    trade.debrief = body.debrief
    trade.pnl = round(pnl, 2)
    trade.r_multiple = round(r_multiple, 4)
    trade.status = "closed"
    db.commit()
    db.refresh(trade)
    return _to_response(trade)
```

- [ ] **Step 2: Register trades router in main.py**

Add these two lines to `backend/main.py` (after the users router include):

```python
from backend.routers import trades as trades_router

# after: app.include_router(users.router, ...)
app.include_router(trades_router.router, prefix="/api", dependencies=[Depends(require_auth)])
```

Full updated imports section and router registrations in `backend/main.py`:

```python
from backend.routers import users
from backend.routers import auth as auth_router
from backend.routers import trades as trades_router
from backend.auth import require_auth

# ...

app.include_router(auth_router.router)
app.include_router(users.router,  prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(trades_router.router, prefix="/api", dependencies=[Depends(require_auth)])
```

- [ ] **Step 3: Run existing tests**

```bash
pytest tests/ -v
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routers/trades.py backend/main.py
git commit -m "feat: add trades router with open/list/close routes"
```

---

## Task 5: Store email on user creation

**Files:**
- Modify: `backend/routers/users.py`

- [ ] **Step 1: Pass email through to User model on creation**

In `backend/routers/users.py`, update `create_user` to store the email if provided:

```python
@router.post("/", response_model=UserResponse, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    _validate_user_body(body)
    user = User(
        name=body.name,
        trading_stage=body.trading_stage,
        time_budget=body.time_budget,
        active_skills=json.dumps(body.active_skills),
        email=body.email or None,
    )
    db.add(user)
    db.flush()
    for skill in body.active_skills:
        db.add(SkillScore(user_id=user.id, skill=skill, score=0.0))
    db.commit()
    db.refresh(user)
    return _to_response(user)
```

- [ ] **Step 2: Run existing tests**

```bash
pytest tests/test_users.py -v
```

Expected: all pass. (email is optional, existing tests don't send it.)

- [ ] **Step 3: Commit**

```bash
git add backend/routers/users.py
git commit -m "feat: store optional email on user creation"
```

---

## Task 6: Write trade route tests

**Files:**
- Create: `tests/test_trades.py`

- [ ] **Step 1: Create `tests/test_trades.py`**

```python
import pytest
import backend.auth as auth_module
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
from backend.auth import require_auth

TEST_DB_URL = "sqlite://"
_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def override_get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[require_auth] = lambda: None
auth_module.DEV_BYPASS_AUTH = True  # get_current_user falls back to first DB user


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


client = TestClient(app)

VALID_USER = {
    "name": "Hernan",
    "trading_stage": "small_money",
    "time_budget": "30min",
    "active_skills": ["chart_reading", "entry_timing", "risk_sizing", "setup_selection"],
}

VALID_LONG = {
    "symbol": "NVDA",
    "direction": "long",
    "entry_price": 900.0,
    "stop_price": 885.0,
    "target_price": 940.0,
    "shares": 10,
}

VALID_SHORT = {
    "symbol": "SPY",
    "direction": "short",
    "entry_price": 500.0,
    "stop_price": 510.0,
    "target_price": 480.0,
    "shares": 5,
}


@pytest.fixture
def user_id():
    resp = client.post("/api/users/", json=VALID_USER)
    assert resp.status_code == 201
    return resp.json()["id"]


def test_list_trades_empty(user_id):
    resp = client.get("/api/trades/")
    assert resp.status_code == 200
    assert resp.json() == []


def test_open_trade_returns_201(user_id):
    resp = client.post("/api/trades/", json=VALID_LONG)
    assert resp.status_code == 201
    data = resp.json()
    assert data["symbol"] == "NVDA"
    assert data["direction"] == "long"
    assert data["status"] == "open"
    assert data["entry_price"] == 900.0
    assert data["exit_price"] is None
    assert data["pnl"] is None
    assert data["r_multiple"] is None


def test_open_trade_appears_in_list(user_id):
    client.post("/api/trades/", json=VALID_LONG)
    trades = client.get("/api/trades/").json()
    assert len(trades) == 1
    assert trades[0]["symbol"] == "NVDA"
    assert trades[0]["status"] == "open"


def test_open_trade_symbol_uppercased(user_id):
    body = {**VALID_LONG, "symbol": "nvda"}
    resp = client.post("/api/trades/", json=body)
    assert resp.json()["symbol"] == "NVDA"


def test_open_trade_invalid_direction(user_id):
    body = {**VALID_LONG, "direction": "buy"}
    assert client.post("/api/trades/", json=body).status_code == 400


def test_open_trade_entry_equals_stop_rejected(user_id):
    body = {**VALID_LONG, "stop_price": 900.0}
    assert client.post("/api/trades/", json=body).status_code == 400


def test_open_trade_zero_shares_rejected(user_id):
    body = {**VALID_LONG, "shares": 0}
    assert client.post("/api/trades/", json=body).status_code == 400


def test_close_long_trade_calculates_pnl_and_r(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    # entry=900, stop=885, exit=930 → pnl=(930-900)*10=300, r=(930-900)/(900-885)=2.0
    resp = client.put(f"/api/trades/{trade_id}/close", json={
        "exit_price": 930.0,
        "debrief": "Held through noise, exit on target.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "closed"
    assert data["exit_price"] == 930.0
    assert data["pnl"] == 300.0
    assert data["r_multiple"] == 2.0


def test_close_short_trade_calculates_pnl_and_r(user_id):
    trade_id = client.post("/api/trades/", json=VALID_SHORT).json()["id"]
    # entry=500, stop=510, exit=480 → pnl=(500-480)*5=100, r=(500-480)/(510-500)=2.0
    resp = client.put(f"/api/trades/{trade_id}/close", json={
        "exit_price": 480.0,
        "debrief": "Short worked perfectly.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["pnl"] == 100.0
    assert data["r_multiple"] == 2.0


def test_close_losing_long_trade_negative_pnl(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    # entry=900, stop=885, exit=885 → pnl=(885-900)*10=-150, r=(885-900)/(900-885)=-1.0
    resp = client.put(f"/api/trades/{trade_id}/close", json={
        "exit_price": 885.0,
        "debrief": "Stopped out.",
    })
    assert resp.status_code == 200
    assert resp.json()["pnl"] == -150.0
    assert resp.json()["r_multiple"] == -1.0


def test_close_requires_debrief(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    resp = client.put(f"/api/trades/{trade_id}/close", json={
        "exit_price": 930.0,
        "debrief": "   ",  # whitespace only
    })
    assert resp.status_code == 400


def test_close_already_closed_returns_400(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    close_body = {"exit_price": 930.0, "debrief": "Done."}
    client.put(f"/api/trades/{trade_id}/close", json=close_body)
    resp = client.put(f"/api/trades/{trade_id}/close", json=close_body)
    assert resp.status_code == 400


def test_close_other_users_trade_returns_404(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    # Trade belongs to user_id; closing trade 9999 returns 404
    resp = client.put("/api/trades/9999/close", json={"exit_price": 930.0, "debrief": "x"})
    assert resp.status_code == 404


def test_list_trades_newest_first(user_id):
    client.post("/api/trades/", json=VALID_LONG)
    client.post("/api/trades/", json=VALID_SHORT)
    trades = client.get("/api/trades/").json()
    assert trades[0]["symbol"] == "SPY"   # most recent first
    assert trades[1]["symbol"] == "NVDA"
```

- [ ] **Step 2: Run the new tests**

```bash
pytest tests/test_trades.py -v
```

Expected: all 14 tests pass.

- [ ] **Step 3: Run full suite to confirm no regressions**

```bash
pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/test_trades.py
git commit -m "test: add trade route tests (open, close, P&L, validation)"
```

---

## Task 7: Frontend — api.js additions

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add api.trades and api.me**

Full updated `frontend/src/api.js`:

```javascript
const BASE = '/api'

export class AuthError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'AuthError'
  }
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export const api = {
  users: {
    list:   ()         => request('GET',  '/users/'),
    create: (body)     => request('POST', '/users/', body),
    get:    (id)       => request('GET',  `/users/${id}`),
    update: (id, body) => request('PUT',  `/users/${id}`, body),
    skills: (id)       => request('GET',  `/users/${id}/skills`),
  },
  trades: {
    list:  ()         => request('GET',  '/trades/'),
    open:  (body)     => request('POST', '/trades/', body),
    close: (id, body) => request('PUT',  `/trades/${id}/close`, body),
  },
  me: () => request('GET', '/me'),
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add api.trades and api.me to frontend api client"
```

---

## Task 8: UserContext — call api.me, expose sessionEmail

**Files:**
- Modify: `frontend/src/context/UserContext.jsx`

- [ ] **Step 1: Update UserContext**

```javascript
import React, { createContext, useContext, useState, useEffect } from 'react'
import { api, AuthError } from '../api'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [users, setUsers]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [sessionEmail, setSessionEmail] = useState(null)

  useEffect(() => {
    const savedId = localStorage.getItem('activeUserId')
    Promise.all([api.users.list(), api.me().catch(() => ({ email: null }))])
      .then(([list, meData]) => {
        setUsers(list)
        setSessionEmail(meData.email)
        if (savedId) {
          const found = list.find(u => u.id === parseInt(savedId, 10))
          if (found) setUser(found)
        }
      })
      .catch(err => {
        if (err instanceof AuthError) setAuthRequired(true)
      })
      .finally(() => setLoading(false))
  }, [])

  function switchUser(u) {
    setUser(u)
    localStorage.setItem('activeUserId', String(u.id))
  }

  function addUser(u) {
    setUsers(prev => [...prev, u])
    switchUser(u)
  }

  return (
    <UserContext.Provider value={{ user, users, loading, authRequired, sessionEmail, switchUser, addUser }}>
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

- [ ] **Step 2: Update Onboarding to pass sessionEmail on user creation**

In `frontend/src/components/Onboarding.jsx`, destructure `sessionEmail` from `useUser()` and pass it to `api.users.create`:

```javascript
// change line:
const { users, addUser, switchUser } = useUser()
// to:
const { users, addUser, switchUser, sessionEmail } = useUser()

// change the api.users.create call inside finish():
const u = await api.users.create({
  name,
  trading_stage: stage,
  time_budget: budget,
  active_skills: skills,
  email: sessionEmail || undefined,
})
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/context/UserContext.jsx frontend/src/components/Onboarding.jsx
git commit -m "feat: call api.me on load, expose sessionEmail; pass email on user creation"
```

---

## Task 9: TradeDrawer.jsx component

**Files:**
- Create: `frontend/src/components/TradeDrawer.jsx`

- [ ] **Step 1: Create TradeDrawer.jsx**

```javascript
import React, { useState, useEffect } from 'react'

export default function TradeDrawer({ mode, trade, onSubmit, onClose }) {
  const [form, setForm] = useState({
    symbol:       '',
    direction:    'long',
    entry_price:  '',
    shares:       '',
    stop_price:   '',
    target_price: '',
    pre_note:     '',
    exit_price:   '',
    debrief:      '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode === 'close' && trade) {
      setForm(f => ({ ...f, exit_price: '', debrief: '' }))
    }
    setErrors({})
  }, [mode, trade])

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const errs = {}
    if (mode === 'open') {
      if (!form.symbol.trim())                    errs.symbol       = 'Required'
      if (!['long','short'].includes(form.direction)) errs.direction = 'Must be long or short'
      if (!form.entry_price || +form.entry_price <= 0) errs.entry_price = 'Must be > 0'
      if (!form.stop_price  || +form.stop_price  <= 0) errs.stop_price  = 'Must be > 0'
      if (!form.target_price || +form.target_price <= 0) errs.target_price = 'Must be > 0'
      if (!form.shares || +form.shares < 1)        errs.shares      = 'Must be >= 1'
      if (+form.stop_price === +form.entry_price)  errs.stop_price  = 'Stop must differ from entry'
    } else {
      if (!form.exit_price || +form.exit_price <= 0) errs.exit_price = 'Must be > 0'
      if (!form.debrief.trim())                     errs.debrief    = 'Required'
    }
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const data = mode === 'open'
        ? {
            symbol:       form.symbol.trim(),
            direction:    form.direction,
            entry_price:  +form.entry_price,
            stop_price:   +form.stop_price,
            target_price: +form.target_price,
            shares:       +form.shares,
            pre_note:     form.pre_note.trim(),
          }
        : {
            exit_price: +form.exit_price,
            debrief:    form.debrief.trim(),
          }
      await onSubmit(data)
      onClose()
    } catch (err) {
      setErrors({ _form: err.message })
    } finally {
      setSaving(false)
    }
  }

  const field = (key, label, type = 'text', placeholder = '') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'var(--surface2)', border: `1px solid ${errors[key] ? 'var(--red)' : 'var(--border2)'}`,
          borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none', width: '100%',
        }}
      />
      {errors[key] && <span style={{ color: 'var(--red)', fontSize: 11 }}>{errors[key]}</span>}
    </div>
  )

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99 }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 280,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 100, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>
            {mode === 'open' ? 'Open Trade' : `Close — ${trade?.symbol}`}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'open' && <>
            {field('symbol',       'Symbol',       'text',   'NVDA')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Direction</label>
              <select
                value={form.direction}
                onChange={e => set('direction', e.target.value)}
                style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none' }}
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            {field('entry_price',  'Entry Price',  'number', '900.00')}
            {field('shares',       'Shares',       'number', '10')}
            {field('stop_price',   'Stop Price',   'number', '885.00')}
            {field('target_price', 'Target Price', 'number', '940.00')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Pre-trade note (optional)</label>
              <textarea
                value={form.pre_note}
                onChange={e => set('pre_note', e.target.value)}
                rows={3}
                placeholder="Why is this a valid setup?"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'var(--font)' }}
              />
            </div>
          </>}

          {mode === 'close' && <>
            <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              <div>{trade?.direction?.toUpperCase()} · Entry ${trade?.entry_price} · {trade?.shares} shares</div>
              <div>Stop ${trade?.stop_price} · Target ${trade?.target_price}</div>
            </div>
            {field('exit_price', 'Exit Price', 'number', '930.00')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Debrief <span style={{ color: 'var(--red)' }}>*</span></label>
              <textarea
                value={form.debrief}
                onChange={e => set('debrief', e.target.value)}
                rows={4}
                placeholder="What happened? What would you do differently?"
                style={{ background: 'var(--surface2)', border: `1px solid ${errors.debrief ? 'var(--red)' : 'var(--border2)'}`, borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'var(--font)' }}
              />
              {errors.debrief && <span style={{ color: 'var(--red)', fontSize: 11 }}>{errors.debrief}</span>}
            </div>
          </>}

          {errors._form && <div style={{ color: 'var(--red)', fontSize: 12 }}>{errors._form}</div>}

          <button
            type="submit"
            disabled={saving}
            style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: 7, padding: '10px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : mode === 'open' ? 'Open Trade' : 'Close Trade'}
          </button>
        </form>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TradeDrawer.jsx
git commit -m "feat: add TradeDrawer slide-in component for open/close flows"
```

---

## Task 10: Journal.jsx — full trade log

**Files:**
- Modify: `frontend/src/pages/Journal.jsx`

- [ ] **Step 1: Replace Journal.jsx**

```javascript
import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import TradeDrawer from '../components/TradeDrawer'

function statusBadge(trade) {
  if (trade.status === 'open') {
    return { label: 'OPEN', color: 'var(--yellow)' }
  }
  return trade.pnl >= 0
    ? { label: 'WIN',  color: 'var(--green)' }
    : { label: 'LOSS', color: 'var(--red)' }
}

function fmt(n, decimals = 2) {
  if (n == null) return '—'
  return n.toFixed(decimals)
}

function fmtPnl(n) {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${n.toFixed(2)}`
}

export default function Journal() {
  const [trades, setTrades]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [drawer, setDrawer]       = useState(null) // null | { mode: 'open' } | { mode: 'close', trade }

  const loadTrades = useCallback(async () => {
    try {
      const data = await api.trades.list()
      setTrades(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTrades() }, [loadTrades])

  async function handleOpen(body) {
    await api.trades.open(body)
    await loadTrades()
  }

  async function handleClose(body) {
    await api.trades.close(drawer.trade.id, body)
    await loadTrades()
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: 'var(--text)', fontWeight: 700 }}>Trade Journal</h2>
        <button
          onClick={() => setDrawer({ mode: 'open' })}
          style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + New Trade
        </button>
      </div>

      {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}
      {error   && <div style={{ color: 'var(--red)',   fontSize: 13 }}>Error: {error}</div>}

      {!loading && !error && trades.length === 0 && (
        <div className="placeholder-card">
          No trades yet. Click + New Trade to log your first.
        </div>
      )}

      {!loading && trades.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                {['Date','Symbol','Dir','Entry','Exit','P&L','R','Status',''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map(t => {
                const badge = statusBadge(t)
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }}>
                    <td style={{ padding: '9px 10px', color: 'var(--muted)' }}>
                      {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: 'var(--text)' }}>{t.symbol}</td>
                    <td style={{ padding: '9px 10px', color: t.direction === 'long' ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', fontSize: 11, fontWeight: 600 }}>{t.direction}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--text2)', fontFamily: 'monospace' }}>${fmt(t.entry_price)}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--text2)', fontFamily: 'monospace' }}>{t.exit_price != null ? `$${fmt(t.exit_price)}` : '—'}</td>
                    <td style={{ padding: '9px 10px', fontFamily: 'monospace', color: t.pnl == null ? 'var(--muted)' : t.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fmtPnl(t.pnl)}
                    </td>
                    <td style={{ padding: '9px 10px', fontFamily: 'monospace', color: 'var(--text2)' }}>
                      {t.r_multiple != null ? `${t.r_multiple >= 0 ? '+' : ''}${fmt(t.r_multiple, 2)}R` : '—'}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{ background: 'transparent', border: `1px solid ${badge.color}`, borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 700, color: badge.color, letterSpacing: '0.05em' }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      {t.status === 'open' && (
                        <button
                          onClick={() => setDrawer({ mode: 'close', trade: t })}
                          style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--muted)', fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
                        >
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {drawer && (
        <TradeDrawer
          mode={drawer.mode}
          trade={drawer.trade}
          onSubmit={drawer.mode === 'open' ? handleOpen : handleClose}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Journal.jsx
git commit -m "feat: Journal page with trade log table and open/close drawer"
```

---

## Task 11: Home.jsx — live Open Positions + This Week's Edge

**Files:**
- Modify: `frontend/src/pages/Home.jsx`

- [ ] **Step 1: Update Home.jsx**

```javascript
import React, { useState, useEffect } from 'react'
import { useUser } from '../context/UserContext'
import { api } from '../api'

const PHASE_LABEL = {
  'pre-market':  'Pre-market',
  'market':      'Market Hours',
  'post-market': 'Post-market',
}

function getPhase(now) {
  const h = now.getHours(), m = now.getMinutes()
  if (h < 9 || (h === 9 && m < 30)) return 'pre-market'
  if (h < 16) return 'market'
  return 'post-market'
}

function getWeekBounds() {
  const now = new Date()
  const day = now.getDay()                  // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

export default function Home() {
  const { user } = useUser()
  const now      = new Date()
  const h        = now.getHours()
  const greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const phase    = getPhase(now)
  const level    = 1

  const [trades, setTrades] = useState([])

  useEffect(() => {
    api.trades.list().then(setTrades).catch(() => {})
  }, [])

  const openTrades = trades.filter(t => t.status === 'open')

  const { monday, sunday } = getWeekBounds()
  const weekClosed = trades.filter(t => {
    if (t.status !== 'closed') return false
    const d = new Date(t.created_at)
    return d >= monday && d <= sunday
  })
  const weekWins  = weekClosed.filter(t => t.pnl >= 0).length
  const weekTotal = weekClosed.length
  const weekPnl   = weekClosed.reduce((sum, t) => sum + (t.pnl || 0), 0)
  const winRate   = weekTotal > 0 ? Math.round((weekWins / weekTotal) * 100) : null

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Good {greeting}, {user.name}</div>
          <div className="phase-label">{PHASE_LABEL[phase]}</div>
        </div>
        <div className="level-badge">Level {level} · Beginner</div>
      </div>

      <div className="placeholder-card">
        <strong>Today's Training Session</strong>
        <p style={{ marginTop: 8 }}>Drills coming in Phase 3.</p>
      </div>

      <div className="grid-2">
        <div className="placeholder-card">
          <strong>Skill Progress</strong>
          <p style={{ marginTop: 8 }}>Charts coming in Phase 3.</p>
        </div>

        {/* Open Positions */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 12, fontSize: 14 }}>Open Positions</div>
          {openTrades.length === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>No open positions.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {openTrades.map(t => (
                <div key={t.id} style={{ borderLeft: `3px solid ${t.direction === 'long' ? 'var(--green)' : 'var(--red)'}`, paddingLeft: 10 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                    {t.symbol} <span style={{ fontWeight: 400, color: t.direction === 'long' ? 'var(--green)' : 'var(--red)', fontSize: 11, textTransform: 'uppercase' }}>{t.direction}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
                    Entry ${t.entry_price.toFixed(2)} · {t.shares} shares · Stop ${t.stop_price.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="placeholder-card">
          <strong>Training Streak</strong>
          <p style={{ marginTop: 8 }}>Coming in Phase 3.</p>
        </div>

        {/* This Week's Edge */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 12, fontSize: 14 }}>This Week's Edge</div>
          {weekTotal === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>No closed trades this week.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>Win Rate</span>
                  <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{winRate}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${winRate}%`, background: 'var(--green)', borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
                <div style={{ color: 'var(--dim)', fontSize: 11, marginTop: 4 }}>
                  {weekWins}W · {weekTotal - weekWins}L this week
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Total P&L</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 14, color: weekPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {weekPnl >= 0 ? '+' : ''}${weekPnl.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Home.jsx
git commit -m "feat: Home dashboard with live Open Positions and This Week's Edge cards"
```

---

## Final: Run all tests and push

- [ ] **Step 1: Run full test suite**

```bash
cd OneDrive/Documents/swing-trainer
pytest tests/ -v
```

Expected: all tests pass including 14 new trade tests.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feature/swing-trainer-phase2
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by task |
|---|---|
| GET /api/trades/ | Task 4 + Task 6 (tests) |
| POST /api/trades/ with validation | Task 4 + Task 6 (tests) |
| PUT /api/trades/{id}/close with P&L calc | Task 4 + Task 6 (tests) |
| TradeCreate / TradeClose / TradeResponse schemas | Task 3 |
| get_current_user helper | Task 2 |
| GET /api/me | Task 1 |
| User.email field + migration | Task 1 |
| UserCreate.email | Task 3 |
| Store email on user creation | Task 5 |
| api.trades.* + api.me | Task 7 |
| UserContext sessionEmail | Task 8 |
| TradeDrawer.jsx | Task 9 |
| Journal.jsx trade log + drawer | Task 10 |
| Home.jsx Open Positions | Task 11 |
| Home.jsx This Week's Edge | Task 11 |
| Debrief required to close | Task 4 (validation) + Task 6 (test) |
| Status badges OPEN/WIN/LOSS | Task 10 |

All 7 success criteria from spec §7 are covered.

**Type consistency check:** `_to_response` in trades router maps `t.entry → entry_price`, `t.stop → stop_price`, `t.target → target_price`, `t.exit → exit_price` consistently across all three route handlers and tests. `TradeResponse` field names match what `_to_response` returns. `TradeDrawer` props `mode`, `trade`, `onSubmit`, `onClose` match usage in `Journal.jsx`.

**Trade model required fields:** `date` set to today's ISO date string; `setup_type` set to `""` — both handled in Task 4 router.
