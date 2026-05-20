# Phase 3 — Playbook, Enhanced Journal & Progress Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Playbook system (setup types + tiered rules), wire checklist scoring into the trade open form, and build a real Progress tab showing skill scores and weekly stats.

**Architecture:** All models are already defined (PlaybookRule, ChecklistLog, SkillScore, etc.) — Phase 3 adds the routes, updates schemas, and builds the frontend. Checklist score is computed client-side from rule checks and sent to the backend on trade open. Progress stats are aggregated server-side from closed trades. Playbook UI lives as a tab toggle within the Journal page.

**Tech Stack:** FastAPI + SQLAlchemy (existing), React 18 + Vite (existing), pytest (existing)

---

## Codebase Context

**Always run before pushing:**
```bash
cd frontend && npm run build
git add frontend/dist
```
Then commit everything together. The pre-built dist is what Railway serves.

**Run tests with:** `pytest tests/ -v` from repo root.

**Existing patterns to follow:**
- Backend routes use `get_current_user` (from `backend/auth.py`) for user scoping
- Trades router uses `_to_response(t)` dict helper instead of ORM→Pydantic directly
- Tests use in-memory SQLite + `autouse` fixture that creates/drops tables per test

**Key existing files:**
- `backend/models.py` — all SQLAlchemy models including PlaybookRule, Trade (already has `practice`, `checklist_score`, `setup_type` columns)
- `backend/schemas.py` — Pydantic schemas for users and trades
- `backend/routers/trades.py` — trade CRUD; TradeCreate currently lacks setup_type/practice/checklist_score
- `backend/routers/users.py` — user CRUD; `GET /api/users/{id}/skills` already returns skill scores
- `backend/main.py` — lifespan does `create_all` + email column migration; registers routers
- `frontend/src/api.js` — thin fetch wrapper; `api.trades`, `api.users`, `api.me`
- `frontend/src/pages/Journal.jsx` — trade log table + TradeDrawer
- `frontend/src/components/TradeDrawer.jsx` — open/close drawer; needs setup type + checklist

---

## File Map

**Create:**
- `backend/routers/playbook.py` — CRUD for playbook rules (5 endpoints)
- `backend/routers/progress.py` — stats aggregation endpoint
- `tests/test_playbook.py` — playbook route tests
- `tests/test_progress.py` — progress stats tests
- `frontend/src/pages/Playbook.jsx` — setup type + rule management UI

**Modify:**
- `backend/schemas.py` — add PlaybookRule schemas; extend TradeCreate/TradeResponse
- `backend/routers/trades.py` — store setup_type/practice/checklist_score; update `_to_response`
- `backend/main.py` — register new routers; add practice/checklist_score migration
- `frontend/src/api.js` — add playbook and progress API methods
- `frontend/src/components/TradeDrawer.jsx` — add setup type dropdown + checklist
- `frontend/src/pages/Journal.jsx` — add Playbook tab toggle
- `frontend/src/pages/Progress.jsx` — replace placeholder with real skill bars + stats
- `frontend/src/App.jsx` — add /playbook route
- `frontend/src/styles/globals.css` — add stat-tile and skill-bar styles
- `frontend/dist/` — rebuilt after all frontend changes

---

## Task 1: DB Migration + Extended Schemas

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/schemas.py`

The deployed DB may have been created before `practice` and `checklist_score` were in the Trade model. The migration adds them if absent. Schemas are extended to expose the new fields.

- [ ] **Step 1: Write the failing test (schema accepts new fields)**

Add to `tests/test_trades.py` after the existing tests:

```python
def test_open_trade_with_setup_and_checklist():
    body = {
        **VALID_TRADE,
        "setup_type": "breakout",
        "practice": False,
        "checklist_score": 75.0,
    }
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["setup_type"] == "breakout"
    assert data["practice"] is False
    assert data["checklist_score"] == 75.0


def test_open_trade_practice_flag():
    body = {**VALID_TRADE, "practice": True}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 201
    assert resp.json()["practice"] is True
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_trades.py::test_open_trade_with_setup_and_checklist -v
```
Expected: FAIL — `setup_type` key missing from response.

- [ ] **Step 3: Extend TradeCreate and TradeResponse in schemas.py**

Open `backend/schemas.py`. Replace the existing `TradeCreate` and `TradeResponse` classes with:

```python
class TradeCreate(BaseModel):
    symbol: str
    direction: str          # "long" | "short"
    entry_price: float
    stop_price: float
    target_price: float
    shares: int
    pre_note: str = ""
    setup_type: Optional[str] = None
    practice: bool = False
    checklist_score: Optional[float] = None  # 0.0–100.0

    model_config = {"str_strip_whitespace": True}


class TradeResponse(BaseModel):
    model_config = {"from_attributes": True}

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
    setup_type: Optional[str]
    practice: bool
    checklist_score: Optional[float]
    pnl: Optional[float]
    r_multiple: Optional[float]
    created_at: datetime
```

Also append these Playbook schemas at the end of `backend/schemas.py`:

```python
VALID_TIERS = {"must", "should", "context"}


class PlaybookRuleCreate(BaseModel):
    setup_type: str
    text: str
    tier: str        # "must" | "should" | "context"
    position: int = 0

    model_config = {"str_strip_whitespace": True}


class PlaybookRuleUpdate(BaseModel):
    text: Optional[str] = None
    tier: Optional[str] = None
    position: Optional[int] = None
    active: Optional[bool] = None


class PlaybookRuleResponse(BaseModel):
    id: int
    setup_type: str
    text: str
    tier: str
    position: int
    active: bool

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Update `_to_response` and `open_trade` in trades.py**

Open `backend/routers/trades.py`. Replace `_to_response`:

```python
def _to_response(t: Trade) -> dict:
    return {
        "id":              t.id,
        "symbol":          t.symbol,
        "direction":       t.direction,
        "entry_price":     t.entry,
        "stop_price":      t.stop,
        "target_price":    t.target,
        "exit_price":      t.exit,
        "shares":          t.shares,
        "status":          t.status,
        "pre_note":        t.pre_note or "",
        "debrief":         t.debrief or "",
        "setup_type":      t.setup_type,
        "practice":        bool(t.practice),
        "checklist_score": t.checklist_score,
        "pnl":             t.pnl,
        "r_multiple":      t.r_multiple,
        "created_at":      t.created_at,
    }
```

In `open_trade`, update the Trade constructor call:

```python
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
        setup_type=body.setup_type or None,
        practice=body.practice,
        checklist_score=body.checklist_score,
    )
```

- [ ] **Step 5: Add DB migration in `backend/main.py` lifespan**

Inside the lifespan function, after the email migration block, add:

```python
    # Migrate trades: add practice and checklist_score if absent
    trade_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(trades)"))]
    if "practice" not in trade_cols:
        conn.execute(text("ALTER TABLE trades ADD COLUMN practice BOOLEAN DEFAULT FALSE"))
        conn.commit()
    if "checklist_score" not in trade_cols:
        conn.execute(text("ALTER TABLE trades ADD COLUMN checklist_score REAL"))
        conn.commit()
```

- [ ] **Step 6: Run failing tests**

```
pytest tests/test_trades.py -v
```
Expected: all existing tests PASS, new tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/schemas.py backend/routers/trades.py backend/main.py tests/test_trades.py
git commit -m "feat: extend trade schema with setup_type, practice, checklist_score"
```

---

## Task 2: Playbook Router

**Files:**
- Create: `backend/routers/playbook.py`
- Create: `tests/test_playbook.py`

Provides CRUD for setup types and their tiered rules. Setup types are implicitly created by adding a first rule. Setup type list is derived from distinct values.

- [ ] **Step 1: Write failing tests**

Create `tests/test_playbook.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
from backend.auth import require_auth
import backend.auth as auth_module

TEST_DB_URL = "sqlite://"
_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

auth_module.DEV_BYPASS_AUTH = True


@pytest.fixture(autouse=True)
def reset_db():
    saved_db = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = lambda: _Session()
    Base.metadata.create_all(bind=_engine)
    # create a seed user so get_current_user (DEV_BYPASS_AUTH) has someone to return
    from backend.models import User, SkillScore
    import json
    db = _Session()
    user = User(
        name="Tester",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=json.dumps(["chart_reading", "entry_timing"]),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    for skill in ["chart_reading", "entry_timing"]:
        db.add(SkillScore(user_id=user.id, skill=skill, score=0.0))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved_db:
        app.dependency_overrides[get_db] = saved_db
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)

RULE = {"setup_type": "breakout", "text": "EMA 20 trending up", "tier": "must", "position": 0}


def test_list_rules_empty():
    resp = client.get("/api/playbook/rules")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_rule_returns_201():
    resp = client.post("/api/playbook/rules", json=RULE)
    assert resp.status_code == 201
    data = resp.json()
    assert data["text"] == RULE["text"]
    assert data["tier"] == "must"
    assert data["active"] is True
    assert "id" in data


def test_create_rule_invalid_tier():
    resp = client.post("/api/playbook/rules", json={**RULE, "tier": "nice_to_have"})
    assert resp.status_code == 400


def test_list_setups_after_create():
    client.post("/api/playbook/rules", json=RULE)
    client.post("/api/playbook/rules", json={**RULE, "setup_type": "pullback", "tier": "should"})
    resp = client.get("/api/playbook/setups")
    assert resp.status_code == 200
    setups = resp.json()
    assert set(setups) == {"breakout", "pullback"}


def test_filter_rules_by_setup():
    client.post("/api/playbook/rules", json=RULE)
    client.post("/api/playbook/rules", json={**RULE, "setup_type": "pullback"})
    resp = client.get("/api/playbook/rules?setup_type=breakout")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["setup_type"] == "breakout"


def test_update_rule():
    rule_id = client.post("/api/playbook/rules", json=RULE).json()["id"]
    resp = client.put(f"/api/playbook/rules/{rule_id}", json={"text": "Updated rule text"})
    assert resp.status_code == 200
    assert resp.json()["text"] == "Updated rule text"


def test_update_rule_invalid_tier():
    rule_id = client.post("/api/playbook/rules", json=RULE).json()["id"]
    resp = client.put(f"/api/playbook/rules/{rule_id}", json={"tier": "bad"})
    assert resp.status_code == 400


def test_delete_rule():
    rule_id = client.post("/api/playbook/rules", json=RULE).json()["id"]
    assert client.delete(f"/api/playbook/rules/{rule_id}").status_code == 204
    resp = client.get("/api/playbook/rules")
    assert resp.json() == []


def test_delete_nonexistent_rule():
    assert client.delete("/api/playbook/rules/999").status_code == 404
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_playbook.py -v
```
Expected: FAIL — `404 Not Found` for all playbook routes.

- [ ] **Step 3: Create `backend/routers/playbook.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import PlaybookRule, User
from backend.schemas import (
    PlaybookRuleCreate, PlaybookRuleUpdate, PlaybookRuleResponse, VALID_TIERS
)

router = APIRouter(prefix="/playbook", tags=["playbook"])


@router.get("/setups", response_model=list[str])
def list_setups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(PlaybookRule.setup_type)
        .filter(PlaybookRule.user_id == current_user.id, PlaybookRule.active == True)
        .distinct()
        .all()
    )
    return sorted(r[0] for r in rows)


@router.get("/rules", response_model=list[PlaybookRuleResponse])
def list_rules(
    setup_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(PlaybookRule).filter(
        PlaybookRule.user_id == current_user.id,
        PlaybookRule.active == True,
    )
    if setup_type:
        q = q.filter(PlaybookRule.setup_type == setup_type)
    return q.order_by(PlaybookRule.setup_type, PlaybookRule.position).all()


@router.post("/rules", response_model=PlaybookRuleResponse, status_code=201)
def create_rule(
    body: PlaybookRuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.tier not in VALID_TIERS:
        raise HTTPException(400, f"tier must be one of: {sorted(VALID_TIERS)}")
    rule = PlaybookRule(
        user_id=current_user.id,
        setup_type=body.setup_type,
        text=body.text,
        tier=body.tier,
        position=body.position,
        active=True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=PlaybookRuleResponse)
def update_rule(
    rule_id: int,
    body: PlaybookRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = db.query(PlaybookRule).filter(
        PlaybookRule.id == rule_id,
        PlaybookRule.user_id == current_user.id,
    ).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    if body.tier is not None and body.tier not in VALID_TIERS:
        raise HTTPException(400, f"tier must be one of: {sorted(VALID_TIERS)}")
    if body.text is not None:
        rule.text = body.text
    if body.tier is not None:
        rule.tier = body.tier
    if body.position is not None:
        rule.position = body.position
    if body.active is not None:
        rule.active = body.active
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = db.query(PlaybookRule).filter(
        PlaybookRule.id == rule_id,
        PlaybookRule.user_id == current_user.id,
    ).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return Response(status_code=204)
```

- [ ] **Step 4: Run tests**

```
pytest tests/test_playbook.py -v
```
Expected: FAIL — routes exist but not registered yet (404).

- [ ] **Step 5: Register playbook router in `backend/main.py`**

Add import at the top:
```python
from backend.routers import playbook as playbook_router
```

Add after the trades router registration:
```python
app.include_router(playbook_router.router, prefix="/api", dependencies=[Depends(require_auth)])
```

- [ ] **Step 6: Run tests again**

```
pytest tests/test_playbook.py -v
```
Expected: all PASS.

- [ ] **Step 7: Run full suite to check no regressions**

```
pytest tests/ -v
```
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/routers/playbook.py backend/main.py backend/schemas.py tests/test_playbook.py
git commit -m "feat: playbook router — setup types and tiered rules CRUD"
```

---

## Task 3: Progress Stats Router

**Files:**
- Create: `backend/routers/progress.py`
- Create: `tests/test_progress.py`

Returns aggregated stats from the user's closed trades: win rate, avg R, plan adherence (avg checklist_score), total P&L.

- [ ] **Step 1: Write failing tests**

Create `tests/test_progress.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
import backend.auth as auth_module

TEST_DB_URL = "sqlite://"
_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

auth_module.DEV_BYPASS_AUTH = True

VALID_TRADE = {
    "symbol": "AAPL",
    "direction": "long",
    "entry_price": 100.0,
    "stop_price": 95.0,
    "target_price": 115.0,
    "shares": 10,
}


@pytest.fixture(autouse=True)
def reset_db():
    saved_db = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = lambda: _Session()
    Base.metadata.create_all(bind=_engine)
    from backend.models import User, SkillScore
    import json
    db = _Session()
    user = User(
        name="Tester",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=json.dumps(["chart_reading", "entry_timing"]),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    for skill in ["chart_reading", "entry_timing"]:
        db.add(SkillScore(user_id=user.id, skill=skill, score=0.0))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved_db:
        app.dependency_overrides[get_db] = saved_db
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_stats_no_trades():
    resp = client.get("/api/progress/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_trades"] == 0
    assert data["closed_trades"] == 0
    assert data["win_rate"] is None
    assert data["avg_r"] is None
    assert data["avg_plan_adherence"] is None
    assert data["total_pnl"] == 0.0


def test_stats_with_closed_trades():
    client.post("/api/trades/", json=VALID_TRADE)
    t2 = client.post("/api/trades/", json=VALID_TRADE).json()
    # Close with a win (exit > entry for long)
    client.put(f"/api/trades/{t2['id']}/close", json={"exit_price": 110.0, "debrief": "Good trade"})

    resp = client.get("/api/progress/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_trades"] == 2
    assert data["closed_trades"] == 1
    assert data["wins"] == 1
    assert data["win_rate"] == 100.0
    assert round(data["avg_r"], 2) == 2.0   # (110-100)/(100-95) = 2.0
    assert data["total_pnl"] == 100.0        # (110-100)*10


def test_stats_plan_adherence():
    body = {**VALID_TRADE, "checklist_score": 80.0}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 201
    stats = client.get("/api/progress/stats").json()
    assert stats["avg_plan_adherence"] == 80.0
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_progress.py -v
```
Expected: FAIL — `/api/progress/stats` does not exist.

- [ ] **Step 3: Create `backend/routers/progress.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Trade, User

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_trades = db.query(Trade).filter(Trade.user_id == current_user.id).all()
    closed = [t for t in all_trades if t.status == "closed"]

    wins = [t for t in closed if t.pnl is not None and t.pnl >= 0]
    win_rate = round(len(wins) / len(closed) * 100, 1) if closed else None

    r_values = [t.r_multiple for t in closed if t.r_multiple is not None]
    avg_r = round(sum(r_values) / len(r_values), 3) if r_values else None

    scores = [t.checklist_score for t in all_trades if t.checklist_score is not None]
    avg_plan_adherence = round(sum(scores) / len(scores), 1) if scores else None

    total_pnl = round(sum(t.pnl for t in closed if t.pnl is not None), 2)

    return {
        "total_trades":       len(all_trades),
        "closed_trades":      len(closed),
        "wins":               len(wins),
        "win_rate":           win_rate,
        "avg_r":              avg_r,
        "avg_plan_adherence": avg_plan_adherence,
        "total_pnl":          total_pnl,
    }
```

- [ ] **Step 4: Register progress router in `backend/main.py`**

Add import:
```python
from backend.routers import progress as progress_router
```

Add after the playbook router registration:
```python
app.include_router(progress_router.router, prefix="/api", dependencies=[Depends(require_auth)])
```

- [ ] **Step 5: Run tests**

```
pytest tests/test_progress.py tests/test_playbook.py tests/test_trades.py -v
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/progress.py backend/main.py tests/test_progress.py
git commit -m "feat: progress stats endpoint — win rate, avg R, plan adherence, total P&L"
```

---

## Task 4: Frontend API Client Updates

**Files:**
- Modify: `frontend/src/api.js`

Adds the playbook and progress API methods. Pattern: thin wrappers matching the existing style.

- [ ] **Step 1: Update `frontend/src/api.js`**

Replace the entire file with:

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
  if (res.status === 204) return null
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
  playbook: {
    setups:       ()         => request('GET',    '/playbook/setups'),
    rules:        (setup)    => request('GET',    `/playbook/rules${setup ? `?setup_type=${encodeURIComponent(setup)}` : ''}`),
    createRule:   (body)     => request('POST',   '/playbook/rules', body),
    updateRule:   (id, body) => request('PUT',    `/playbook/rules/${id}`, body),
    deleteRule:   (id)       => request('DELETE', `/playbook/rules/${id}`),
  },
  progress: {
    stats: () => request('GET', '/progress/stats'),
  },
  me: () => request('GET', '/me'),
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add playbook and progress API methods to frontend client"
```

---

## Task 5: Playbook Page

**Files:**
- Create: `frontend/src/pages/Playbook.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/styles/globals.css`

Playbook is accessible from the sidebar under Journal. Shows setup types as sections, each with rules grouped by tier. User can add setup types, add rules, delete rules.

- [ ] **Step 1: Add styles to `frontend/src/styles/globals.css`**

Append at the end of the file:

```css
/* Playbook */
.playbook-section { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.playbook-section-header { display: flex; justify-content: space-between; align-items: center; }
.playbook-setup-title { font-weight: 700; color: var(--text); font-size: 0.95em; }
.playbook-tier-label { font-size: 0.72em; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 8px; margin-bottom: 4px; }
.playbook-rule-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); }
.playbook-rule-text { font-size: 0.85em; color: var(--text2); flex: 1; }
.playbook-delete-btn { background: none; border: none; color: var(--dim); font-size: 0.85em; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.playbook-delete-btn:hover { color: var(--red); }
.playbook-add-row { display: flex; gap: 8px; margin-top: 8px; }
.playbook-add-row input, .playbook-add-row select { background: var(--surface2); border: 1px solid var(--border2); border-radius: 6px; color: var(--text); padding: 6px 10px; font-size: 0.85em; font-family: var(--font); outline: none; }
.playbook-add-row input { flex: 1; }
.playbook-add-row input:focus, .playbook-add-row select:focus { border-color: var(--accent); }
.playbook-add-btn { background: #238636; color: #fff; border: none; border-radius: 6px; padding: 6px 14px; font-size: 0.85em; font-weight: 600; cursor: pointer; white-space: nowrap; }
.playbook-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.setup-input-row { display: flex; gap: 8px; margin-bottom: 16px; }
.setup-input-row input { flex: 1; }

/* Progress */
.stat-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat-tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; display: flex; flex-direction: column; gap: 4px; }
.stat-tile-label { font-size: 0.78em; color: var(--muted); }
.stat-tile-value { font-size: 1.4em; font-weight: 700; color: var(--text); font-family: monospace; }
.skill-bars { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.skill-bar-row { display: flex; flex-direction: column; gap: 5px; }
.skill-bar-header { display: flex; justify-content: space-between; font-size: 0.85em; }
.skill-bar-name { color: var(--text2); }
.skill-bar-score { color: var(--text); font-weight: 600; font-family: monospace; }
.skill-bar-track { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
.skill-bar-fill { height: 100%; border-radius: 3px; background: var(--accent); transition: width 0.5s; }
```

- [ ] **Step 2: Create `frontend/src/pages/Playbook.jsx`**

```jsx
import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

const TIER_COLORS = {
  must:    'var(--red)',
  should:  'var(--yellow)',
  context: 'var(--accent)',
}
const TIER_LABELS = { must: 'Must-Have', should: 'Should-Have', context: 'Context Note' }
const TIERS = ['must', 'should', 'context']

const SKILL_LABELS = {
  chart_reading:        'Chart Reading',
  entry_timing:         'Entry Timing',
  risk_sizing:          'Risk & Sizing',
  setup_selection:      'Setup Selection',
  trade_management:     'Trade Management',
  emotional_discipline: 'Emotional Discipline',
}

export default function Playbook() {
  const [setups, setSetups]   = useState([])
  const [rules, setRules]     = useState({})   // { [setup_type]: PlaybookRuleResponse[] }
  const [loading, setLoading] = useState(true)
  const [newSetup, setNewSetup]   = useState('')
  const [addForms, setAddForms]   = useState({}) // { [setup_type]: { text, tier } }

  const reload = useCallback(async () => {
    const setupList = await api.playbook.setups()
    setSetups(setupList)
    const ruleMap = {}
    await Promise.all(
      setupList.map(async s => {
        ruleMap[s] = await api.playbook.rules(s)
      })
    )
    setRules(ruleMap)
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  async function handleAddSetup() {
    const name = newSetup.trim()
    if (!name) return
    // Create a seed "context" rule to establish the setup type
    await api.playbook.createRule({ setup_type: name, text: 'Setup created', tier: 'context', position: 0 })
    setNewSetup('')
    await reload()
  }

  async function handleAddRule(setupType) {
    const form = addForms[setupType] || { text: '', tier: 'must' }
    if (!form.text.trim()) return
    await api.playbook.createRule({
      setup_type: setupType,
      text: form.text.trim(),
      tier: form.tier,
      position: (rules[setupType] || []).length,
    })
    setAddForms(f => ({ ...f, [setupType]: { text: '', tier: 'must' } }))
    await reload()
  }

  async function handleDelete(ruleId) {
    await api.playbook.deleteRule(ruleId)
    await reload()
  }

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div className="page">
      <h2 style={{ color: 'var(--text)', fontWeight: 700 }}>My Playbook</h2>

      {/* Add new setup type */}
      <div className="playbook-section">
        <div style={{ fontWeight: 600, color: 'var(--text2)', fontSize: '0.88em', marginBottom: 4 }}>
          New Setup Type
        </div>
        <div className="setup-input-row">
          <input
            className="onb-input"
            style={{ fontSize: '0.9em', padding: '8px 12px' }}
            placeholder="e.g. Breakout, Pullback, Reversal…"
            value={newSetup}
            onChange={e => setNewSetup(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddSetup()}
          />
          <button className="playbook-add-btn" onClick={handleAddSetup} disabled={!newSetup.trim()}>
            Add Setup
          </button>
        </div>
      </div>

      {setups.length === 0 && (
        <div className="placeholder-card">No setup types yet. Add your first above.</div>
      )}

      {setups.map(setup => {
        const setupRules = rules[setup] || []
        const form = addForms[setup] || { text: '', tier: 'must' }

        return (
          <div key={setup} className="playbook-section">
            <div className="playbook-section-header">
              <span className="playbook-setup-title">{setup.charAt(0).toUpperCase() + setup.slice(1)}</span>
              <span style={{ color: 'var(--dim)', fontSize: '0.78em' }}>{setupRules.length} rules</span>
            </div>

            {TIERS.map(tier => {
              const tierRules = setupRules.filter(r => r.tier === tier)
              return (
                <div key={tier}>
                  <div className="playbook-tier-label" style={{ color: TIER_COLORS[tier] }}>
                    {TIER_LABELS[tier]}
                  </div>
                  {tierRules.length === 0 && (
                    <div style={{ color: 'var(--dim)', fontSize: '0.82em', padding: '4px 0' }}>None</div>
                  )}
                  {tierRules.map(rule => (
                    <div key={rule.id} className="playbook-rule-row">
                      <span className="playbook-rule-text">{rule.text}</span>
                      <button className="playbook-delete-btn" onClick={() => handleDelete(rule.id)}>✕</button>
                    </div>
                  ))}
                </div>
              )
            })}

            {/* Add rule form */}
            <div className="playbook-add-row" style={{ marginTop: 12 }}>
              <input
                placeholder="New rule…"
                value={form.text}
                onChange={e => setAddForms(f => ({ ...f, [setup]: { ...form, text: e.target.value } }))}
                onKeyDown={e => e.key === 'Enter' && handleAddRule(setup)}
              />
              <select
                value={form.tier}
                onChange={e => setAddForms(f => ({ ...f, [setup]: { ...form, tier: e.target.value } }))}
              >
                <option value="must">Must-Have</option>
                <option value="should">Should-Have</option>
                <option value="context">Context Note</option>
              </select>
              <button
                className="playbook-add-btn"
                onClick={() => handleAddRule(setup)}
                disabled={!form.text.trim()}
              >
                Add
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Add Playbook nav item to `frontend/src/components/Sidebar.jsx`**

Replace the NAV array:

```javascript
const NAV = [
  { to: '/',          icon: '🏠', label: 'Home',      exact: true },
  { to: '/train',     icon: '🎯', label: 'Train' },
  { to: '/journal',   icon: '📓', label: 'Journal' },
  { to: '/playbook',  icon: '📋', label: 'Playbook' },
  { to: '/watchlist', icon: '👁️', label: 'Watchlist' },
  { to: '/progress',  icon: '📈', label: 'Progress' },
]
```

- [ ] **Step 4: Add Playbook route to `frontend/src/App.jsx`**

Add this import after the existing page imports:
```javascript
import Playbook from './pages/Playbook'
```

Add this route inside the `<Routes>` block (after the journal route):
```jsx
<Route path="/playbook" element={<Playbook />} />
```

- [ ] **Step 5: Rebuild and commit**

```bash
cd frontend && npm run build && cd ..
git add frontend/src/pages/Playbook.jsx frontend/src/components/Sidebar.jsx \
        frontend/src/App.jsx frontend/src/styles/globals.css \
        frontend/dist/
git commit -m "feat: Playbook page — manage setup types and tiered rules"
```

---

## Task 6: Enhanced TradeDrawer with Setup Type + Checklist

**Files:**
- Modify: `frontend/src/components/TradeDrawer.jsx`

When opening a trade, the drawer shows a setup type dropdown (from the user's playbook). Selecting a setup type loads the rules as a checklist. Must-have rules that are unchecked disable the submit button. Checklist score (0–100) is computed and sent to the backend.

- [ ] **Step 1: Replace `frontend/src/components/TradeDrawer.jsx`**

```jsx
import React, { useState, useEffect } from 'react'
import { api } from '../api'

const TIER_COLORS = { must: 'var(--red)', should: 'var(--yellow)', context: 'var(--accent)' }
const TIER_LABELS = { must: 'Must-Have', should: 'Should-Have', context: 'Context Note' }

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
    setup_type:   '',
    practice:     false,
  })
  const [errors, setErrors]         = useState({})
  const [saving, setSaving]         = useState(false)
  const [setups, setSetups]         = useState([])
  const [rules, setRules]           = useState([])    // rules for selected setup type
  const [checked, setChecked]       = useState({})    // { [rule_id]: boolean }

  // Load available setup types once when drawer opens in 'open' mode
  useEffect(() => {
    if (mode !== 'open') return
    api.playbook.setups().then(setSetups).catch(() => {})
  }, [mode])

  // Load rules when setup_type changes
  useEffect(() => {
    if (mode !== 'open' || !form.setup_type) { setRules([]); setChecked({}); return }
    api.playbook.rules(form.setup_type).then(r => {
      setRules(r)
      setChecked(Object.fromEntries(r.map(rule => [rule.id, false])))
    }).catch(() => {})
  }, [form.setup_type, mode])

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

  function toggleRule(id) {
    setChecked(c => ({ ...c, [id]: !c[id] }))
  }

  // % of (must + should) rules that are checked
  function computeChecklistScore() {
    const scoreable = rules.filter(r => r.tier === 'must' || r.tier === 'should')
    if (scoreable.length === 0) return null
    const checkedCount = scoreable.filter(r => checked[r.id]).length
    return Math.round((checkedCount / scoreable.length) * 100)
  }

  const mustUnchecked = rules.filter(r => r.tier === 'must' && !checked[r.id])

  function validate() {
    const errs = {}
    if (mode === 'open') {
      if (!form.symbol.trim())                              errs.symbol       = 'Required'
      if (!['long','short'].includes(form.direction))       errs.direction    = 'Must be long or short'
      if (!form.entry_price  || +form.entry_price  <= 0)   errs.entry_price  = 'Must be > 0'
      if (!form.stop_price   || +form.stop_price   <= 0)   errs.stop_price   = 'Must be > 0'
      if (!form.target_price || +form.target_price <= 0)   errs.target_price = 'Must be > 0'
      if (!form.shares       || +form.shares       < 1)    errs.shares       = 'Must be >= 1'
      if (+form.stop_price   === +form.entry_price)        errs.stop_price   = 'Stop must differ from entry'
    } else {
      if (!form.exit_price || +form.exit_price <= 0)       errs.exit_price   = 'Must be > 0'
      if (!form.debrief.trim())                            errs.debrief      = 'Required'
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
            symbol:          form.symbol.trim(),
            direction:       form.direction,
            entry_price:     +form.entry_price,
            stop_price:      +form.stop_price,
            target_price:    +form.target_price,
            shares:          +form.shares,
            pre_note:        form.pre_note.trim(),
            setup_type:      form.setup_type || null,
            practice:        form.practice,
            checklist_score: computeChecklistScore(),
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
          background: 'var(--surface2)',
          border: `1px solid ${errors[key] ? 'var(--red)' : 'var(--border2)'}`,
          borderRadius: 6, color: 'var(--text)', padding: '7px 10px',
          fontSize: 13, outline: 'none', width: '100%',
        }}
      />
      {errors[key] && <span style={{ color: 'var(--red)', fontSize: 11 }}>{errors[key]}</span>}
    </div>
  )

  const submitDisabled = saving || (mode === 'open' && mustUnchecked.length > 0)

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99 }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 300,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 100, overflowY: 'auto', padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>
            {mode === 'open' ? 'Open Trade' : `Close — ${trade?.symbol}`}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'open' && <>
            {field('symbol', 'Symbol', 'text', 'NVDA')}

            {/* Setup Type */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Setup Type</label>
              {setups.length > 0 ? (
                <select
                  value={form.setup_type}
                  onChange={e => set('setup_type', e.target.value)}
                  style={{
                    background: 'var(--surface2)', border: '1px solid var(--border2)',
                    borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none',
                  }}
                >
                  <option value="">— None —</option>
                  {setups.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.setup_type}
                  onChange={e => set('setup_type', e.target.value)}
                  placeholder="Breakout, Pullback… (optional)"
                  style={{
                    background: 'var(--surface2)', border: '1px solid var(--border2)',
                    borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none',
                  }}
                />
              )}
            </div>

            {/* Checklist */}
            {rules.length > 0 && (
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
                  Playbook Checklist
                  {mustUnchecked.length > 0 && (
                    <span style={{ color: 'var(--red)', marginLeft: 8 }}>
                      {mustUnchecked.length} must-have unchecked
                    </span>
                  )}
                </div>
                {['must', 'should', 'context'].map(tier => {
                  const tierRules = rules.filter(r => r.tier === tier)
                  if (tierRules.length === 0) return null
                  return (
                    <div key={tier}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: TIER_COLORS[tier], marginBottom: 4, letterSpacing: '0.06em' }}>
                        {TIER_LABELS[tier]}
                      </div>
                      {tierRules.map(rule => (
                        <label key={rule.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 4 }}>
                          {tier !== 'context' ? (
                            <input
                              type="checkbox"
                              checked={!!checked[rule.id]}
                              onChange={() => toggleRule(rule.id)}
                              style={{ marginTop: 2, flexShrink: 0 }}
                            />
                          ) : (
                            <span style={{ width: 14, height: 14, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>{rule.text}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
                {computeChecklistScore() !== null && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                    Score: <strong style={{ color: 'var(--text)' }}>{computeChecklistScore()}%</strong>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Direction</label>
              <select
                value={form.direction}
                onChange={e => set('direction', e.target.value)}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border2)',
                  borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none',
                }}
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
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border2)',
                  borderRadius: 6, color: 'var(--text)', padding: '7px 10px',
                  fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'var(--font)',
                }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.practice}
                onChange={e => set('practice', e.target.checked)}
              />
              Practice / paper trade
            </label>
          </>}

          {mode === 'close' && <>
            <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              <div>{trade?.direction?.toUpperCase()} · Entry ${trade?.entry_price} · {trade?.shares} shares</div>
              <div>Stop ${trade?.stop_price} · Target ${trade?.target_price}</div>
            </div>
            {field('exit_price', 'Exit Price', 'number', '930.00')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>
                Debrief <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <textarea
                value={form.debrief}
                onChange={e => set('debrief', e.target.value)}
                rows={4}
                placeholder="What happened? What would you do differently?"
                style={{
                  background: 'var(--surface2)',
                  border: `1px solid ${errors.debrief ? 'var(--red)' : 'var(--border2)'}`,
                  borderRadius: 6, color: 'var(--text)', padding: '7px 10px',
                  fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'var(--font)',
                }}
              />
              {errors.debrief && <span style={{ color: 'var(--red)', fontSize: 11 }}>{errors.debrief}</span>}
            </div>
          </>}

          {errors._form && <div style={{ color: 'var(--red)', fontSize: 12 }}>{errors._form}</div>}

          <button
            type="submit"
            disabled={submitDisabled}
            style={{
              background: '#238636', color: '#fff', border: 'none', borderRadius: 7,
              padding: '10px', fontSize: 13, fontWeight: 600,
              cursor: submitDisabled ? 'not-allowed' : 'pointer', opacity: submitDisabled ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : mode === 'open' ? 'Open Trade' : 'Close Trade'}
          </button>
        </form>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Rebuild and commit**

```bash
cd frontend && npm run build && cd ..
git add frontend/src/components/TradeDrawer.jsx frontend/dist/
git commit -m "feat: TradeDrawer — setup type dropdown, playbook checklist, practice toggle"
```

---

## Task 7: Progress Tab

**Files:**
- Modify: `frontend/src/pages/Progress.jsx`

Replaces the placeholder with: stat tiles row (win rate, avg R, plan adherence, total P&L) and skill score bars.

- [ ] **Step 1: Replace `frontend/src/pages/Progress.jsx`**

```jsx
import React, { useState, useEffect } from 'react'
import { useUser } from '../context/UserContext'
import { api } from '../api'

const SKILL_LABELS = {
  chart_reading:        'Chart Reading',
  entry_timing:         'Entry Timing',
  risk_sizing:          'Risk & Sizing',
  setup_selection:      'Setup Selection',
  trade_management:     'Trade Management',
  emotional_discipline: 'Emotional Discipline',
}

function StatTile({ label, value, suffix = '', color }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value" style={color ? { color } : {}}>
        {value != null ? `${value}${suffix}` : '—'}
      </div>
    </div>
  )
}

export default function Progress() {
  const { user } = useUser()
  const [stats, setStats]   = useState(null)
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.progress.stats(),
      api.users.skills(user.id),
    ]).then(([s, sk]) => {
      setStats(s)
      setSkills(sk)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [user.id])

  if (loading) return <div className="loading">Loading…</div>

  const winRateColor = stats?.win_rate == null ? null
    : stats.win_rate >= 50 ? 'var(--green)' : 'var(--red)'

  const avgRColor = stats?.avg_r == null ? null
    : stats.avg_r >= 1 ? 'var(--green)' : stats.avg_r >= 0 ? 'var(--yellow)' : 'var(--red)'

  return (
    <div className="page">
      <h2 style={{ color: 'var(--text)', fontWeight: 700 }}>Progress</h2>

      {/* Stat tiles */}
      <div className="stat-tiles">
        <StatTile
          label="Win Rate"
          value={stats?.win_rate}
          suffix="%"
          color={winRateColor}
        />
        <StatTile
          label="Avg R"
          value={stats?.avg_r != null ? stats.avg_r.toFixed(2) : null}
          suffix="R"
          color={avgRColor}
        />
        <StatTile
          label="Plan Adherence"
          value={stats?.avg_plan_adherence}
          suffix="%"
        />
        <StatTile
          label="Total P&L"
          value={stats?.total_pnl != null ? (stats.total_pnl >= 0 ? `+$${stats.total_pnl.toFixed(2)}` : `-$${Math.abs(stats.total_pnl).toFixed(2)}`) : null}
          color={stats?.total_pnl >= 0 ? 'var(--green)' : 'var(--red)'}
        />
      </div>

      {/* Skill score bars */}
      <div className="skill-bars">
        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 4 }}>
          Skill Scores
        </div>
        {skills.length === 0 && (
          <div style={{ color: 'var(--dim)', fontSize: 13 }}>No skill data yet.</div>
        )}
        {skills.map(s => (
          <div key={s.skill} className="skill-bar-row">
            <div className="skill-bar-header">
              <span className="skill-bar-name">{SKILL_LABELS[s.skill] || s.skill}</span>
              <span className="skill-bar-score">{s.score.toFixed(0)}/100</span>
            </div>
            <div className="skill-bar-track">
              <div className="skill-bar-fill" style={{ width: `${s.score}%` }} />
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
          Skill scores update as you complete drills in Phase 4.
        </div>
      </div>

      {/* Trade summary */}
      {stats && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 12 }}>Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, color: 'var(--text2)' }}>
            <div>Total trades logged</div><div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.total_trades}</div>
            <div>Closed trades</div><div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.closed_trades}</div>
            <div>Wins</div><div style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--green)' }}>{stats.wins}</div>
            <div>Losses</div><div style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--red)' }}>{stats.closed_trades - stats.wins}</div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Rebuild and commit**

```bash
cd frontend && npm run build && cd ..
git add frontend/src/pages/Progress.jsx frontend/dist/
git commit -m "feat: Progress tab — skill bars, stat tiles (win rate, avg R, plan adherence, P&L)"
```

---

## Task 8: Run Full Test Suite + Push

- [ ] **Step 1: Run all tests**

```
pytest tests/ -v
```
Expected: all tests PASS with no errors.

If any test fails, fix it before proceeding. Common issues:
- If `test_playbook.py` or `test_progress.py` conflict over `app.dependency_overrides[get_db]`, check that the autouse fixture saves and restores the override (same pattern as test_trades.py).

- [ ] **Step 2: Final push**

```bash
git push
```

- [ ] **Step 3: Verify Railway deploys and loads**

Open the Railway URL. Expected flow (with `DEV_BYPASS_AUTH=true` and an existing user in DB):
- Home loads with Open Positions and This Week's Edge
- Journal shows trade table, "New Trade" drawer has Setup Type + checklist
- Playbook shows the management UI
- Progress shows skill bars + stat tiles

If `DEV_BYPASS_AUTH=false`, the app shows the Google login screen — that's correct.

---

## Self-Review

**Spec coverage check:**
- Playbook: setup types ✓, tiered rules (must/should/context) ✓, rule builder ✓, blocking must-have on submit ✓
- Journal: setup type dropdown ✓, checklist inline ✓, checklist_score stored ✓, practice toggle ✓
- Progress: skill score bars ✓, stat tiles (win rate, avg R, plan adherence, P&L) ✓
- Trade history: already in Journal page ✓

**Deferred to Phase 4 (intentionally out of scope here):**
- Drills and training tab (requires yfinance + Claude)
- AI auto-debrief on close (requires Claude)
- Skill score updates from trades (primary driver is drills)
- Watchlist with live prices (requires yfinance)
- Drag-and-drop rule reordering
