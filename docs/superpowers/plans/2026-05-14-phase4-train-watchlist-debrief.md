# Phase 4 — Train Tab, Watchlist & Auto-Debrief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a working Train tab (Risk Calculator drill, daily assignment, skill score updates), live Watchlist prices via yfinance, and Claude-powered auto-debrief on trade close.

**Architecture:** Two new backend services (`market.py` for yfinance, `claude.py` for Anthropic) feed three new routers (market, watchlist, train). The `ai_debrief` field is added to Trade via migration. The Risk Calculator is the first implemented drill type — no chart data required. Skill scores update after each submitted drill result using an EMA of the last 10 drill scores. Chart-based drills (Chart Entry, Setup Validity, Scan Sprint, Trade Autopsy) are Phase 5.

**Tech Stack:** FastAPI + SQLAlchemy + yfinance + anthropic SDK (existing), React 18 + Vite (existing), pytest (existing)

---

## Codebase Context

**Always run before pushing:**
```bash
cd frontend && npm run build
git add frontend/dist
```
Then commit everything together. Railway serves the pre-built dist.

**Run tests:** `pytest tests/ -v` from repo root.

**Key patterns:**
- All `/api` routes use `get_current_user` for user scoping
- `_to_response(t)` dict helper in `trades.py` — extend it when Trade fields change
- Test fixtures: in-memory SQLite + `autouse` fixture seeds a user per test; `auth_module.DEV_BYPASS_AUTH = True`
- `DRILLS_PER_DAY` dict in `schemas.py`: `{"15min": 1, "30min": 2, "60min": 3}`
- Services live in `backend/services/` (new directory)

**Env vars needed on Railway:**
- `ANTHROPIC_API_KEY` — for Claude debrief. If absent, debrief endpoint returns a placeholder string (no crash).

---

## File Map

**Create:**
- `backend/services/__init__.py`
- `backend/services/market.py` — yfinance quote fetcher with 15-min in-process cache
- `backend/services/claude.py` — Claude debrief generator
- `backend/routers/market.py` — `GET /api/market/quote/{symbol}`
- `backend/routers/watchlist.py` — CRUD for watchlist items
- `backend/routers/train.py` — today's drills, generate/submit Risk Calculator
- `tests/test_watchlist.py`
- `tests/test_train.py`
- `frontend/src/pages/Watchlist.jsx` — replace placeholder
- `frontend/src/pages/Train.jsx` — replace placeholder
- `frontend/src/components/drills/RiskCalcDrill.jsx`

**Modify:**
- `backend/models.py` — add `ai_debrief` column to Trade
- `backend/schemas.py` — add WatchlistItem schemas, RiskCalcSubmit; extend TradeResponse
- `backend/routers/trades.py` — add `ai_debrief` to `_to_response`; add `POST /{id}/ai-debrief`
- `backend/main.py` — register 3 new routers; add `ai_debrief` migration
- `frontend/src/api.js` — add watchlist, market, train API methods
- `frontend/src/pages/Home.jsx` — replace Today's Training Session placeholder
- `frontend/src/styles/globals.css` — add watchlist + train + drill styles
- `frontend/dist/` — rebuilt after all frontend changes

---

## Task 1: Market Service + Watchlist Backend

**Files:**
- Create: `backend/services/__init__.py`
- Create: `backend/services/market.py`
- Create: `backend/routers/market.py`
- Create: `backend/routers/watchlist.py`
- Modify: `backend/schemas.py`
- Modify: `backend/main.py`
- Create: `tests/test_watchlist.py`

- [ ] **Step 1: Write failing watchlist tests**

Create `tests/test_watchlist.py`:

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
_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

auth_module.DEV_BYPASS_AUTH = True


@pytest.fixture(autouse=True)
def reset_db():
    saved = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = lambda: _Session()
    Base.metadata.create_all(bind=_engine)
    from backend.models import User, SkillScore
    import json
    db = _Session()
    user = User(name="T", trading_stage="small_money", time_budget="30min",
                active_skills=json.dumps(["risk_sizing", "entry_timing"]))
    db.add(user)
    db.commit()
    db.refresh(user)
    for skill in ["risk_sizing", "entry_timing"]:
        db.add(SkillScore(user_id=user.id, skill=skill, score=0.0))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved:
        app.dependency_overrides[get_db] = saved
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_watchlist_empty():
    resp = client.get("/api/watchlist/")
    assert resp.status_code == 200
    assert resp.json() == []


def test_add_symbol():
    resp = client.post("/api/watchlist/", json={"symbol": "nvda", "notes": "watching breakout"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["symbol"] == "NVDA"
    assert data["notes"] == "watching breakout"
    assert "id" in data


def test_add_duplicate_rejected():
    client.post("/api/watchlist/", json={"symbol": "AAPL"})
    resp = client.post("/api/watchlist/", json={"symbol": "aapl"})
    assert resp.status_code == 409


def test_delete_item():
    item_id = client.post("/api/watchlist/", json={"symbol": "MSFT"}).json()["id"]
    assert client.delete(f"/api/watchlist/{item_id}").status_code == 204
    assert client.get("/api/watchlist/").json() == []


def test_delete_nonexistent():
    assert client.delete("/api/watchlist/999").status_code == 404


def test_update_notes():
    item_id = client.post("/api/watchlist/", json={"symbol": "TSLA"}).json()["id"]
    resp = client.put(f"/api/watchlist/{item_id}/notes", json={"notes": "updated note"})
    assert resp.status_code == 200
    assert resp.json()["notes"] == "updated note"
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_watchlist.py -v
```
Expected: FAIL — `/api/watchlist/` routes do not exist.

- [ ] **Step 3: Add WatchlistItem schemas to `backend/schemas.py`**

Append at the end of the file:

```python
class WatchlistItemCreate(BaseModel):
    symbol: str
    notes: str = ""

    model_config = {"str_strip_whitespace": True}


class WatchlistItemUpdate(BaseModel):
    notes: str = ""


class WatchlistItemResponse(BaseModel):
    id: int
    symbol: str
    notes: str
    added_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Create `backend/services/__init__.py`**

Empty file — makes `services` a Python package.

```python
```

- [ ] **Step 5: Create `backend/services/market.py`**

```python
import time
import yfinance as yf

_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 900  # 15 minutes


def get_quote(symbol: str) -> dict:
    now = time.time()
    if symbol in _cache:
        ts, data = _cache[symbol]
        if now - ts < _CACHE_TTL:
            return data
    ticker = yf.Ticker(symbol)
    fi = ticker.fast_info
    price = fi.last_price
    prev = fi.previous_close or price
    data = {
        "symbol":     symbol.upper(),
        "price":      round(price, 2),
        "prev_close": round(prev, 2),
        "change_pct": round((price - prev) / prev * 100, 2) if prev else 0.0,
        "day_high":   round(fi.day_high, 2),
        "day_low":    round(fi.day_low, 2),
        "volume":     fi.last_volume,
        "avg_volume": fi.three_month_average_volume,
    }
    _cache[symbol] = (now, data)
    return data
```

- [ ] **Step 6: Create `backend/routers/market.py`**

```python
from fastapi import APIRouter, HTTPException
from backend.services.market import get_quote

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/quote/{symbol}")
def quote(symbol: str):
    try:
        return get_quote(symbol.upper())
    except Exception as e:
        raise HTTPException(422, f"Could not fetch quote for {symbol}: {e}")
```

- [ ] **Step 7: Create `backend/routers/watchlist.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import WatchlistItem, User
from backend.schemas import WatchlistItemCreate, WatchlistItemUpdate, WatchlistItemResponse

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("/", response_model=list[WatchlistItemResponse])
def list_watchlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == current_user.id)
        .order_by(WatchlistItem.added_at.desc())
        .all()
    )


@router.post("/", response_model=WatchlistItemResponse, status_code=201)
def add_to_watchlist(
    body: WatchlistItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    symbol = body.symbol.upper().strip()
    existing = db.query(WatchlistItem).filter(
        WatchlistItem.user_id == current_user.id,
        WatchlistItem.symbol == symbol,
    ).first()
    if existing:
        raise HTTPException(409, "Symbol already in watchlist")
    item = WatchlistItem(user_id=current_user.id, symbol=symbol, notes=body.notes)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}/notes", response_model=WatchlistItemResponse)
def update_notes(
    item_id: int,
    body: WatchlistItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(WatchlistItem).filter(
        WatchlistItem.id == item_id,
        WatchlistItem.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(404, "Item not found")
    item.notes = body.notes
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def remove_from_watchlist(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(WatchlistItem).filter(
        WatchlistItem.id == item_id,
        WatchlistItem.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(404, "Item not found")
    db.delete(item)
    db.commit()
    return Response(status_code=204)
```

- [ ] **Step 8: Register routers in `backend/main.py`**

Add imports after the existing router imports:
```python
from backend.routers import market as market_router
from backend.routers import watchlist as watchlist_router
```

Add registrations after the progress router line:
```python
app.include_router(market_router.router, prefix="/api")
app.include_router(watchlist_router.router, prefix="/api", dependencies=[Depends(require_auth)])
```

Note: `market_router` has no auth dependency — quote prices are public. Watchlist requires auth.

- [ ] **Step 9: Run tests**

```
pytest tests/test_watchlist.py -v
```
Expected: all 6 PASS.

- [ ] **Step 10: Run full suite to check no regressions**

```
pytest tests/ -v
```
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/services/__init__.py backend/services/market.py \
        backend/routers/market.py backend/routers/watchlist.py \
        backend/schemas.py backend/main.py tests/test_watchlist.py
git commit -m "feat: market quote service (yfinance) and watchlist CRUD"
```

---

## Task 2: Auto-Debrief via Claude

**Files:**
- Create: `backend/services/claude.py`
- Modify: `backend/models.py` — add `ai_debrief` to Trade
- Modify: `backend/schemas.py` — add `ai_debrief` to TradeResponse
- Modify: `backend/routers/trades.py` — update `_to_response`; add debrief endpoint
- Modify: `backend/main.py` — add `ai_debrief` migration

The debrief endpoint (`POST /api/trades/{id}/ai-debrief`) generates a Claude debrief and stores it on the trade. It's called by the frontend after closing a trade. If `ANTHROPIC_API_KEY` is not configured, it returns a placeholder string — no crash.

- [ ] **Step 1: Write failing test**

Add to `tests/test_trades.py` (at the end):

```python
from unittest.mock import patch


def test_ai_debrief_requires_closed_trade(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    resp = client.post(f"/api/trades/{trade_id}/ai-debrief")
    assert resp.status_code == 400


def test_ai_debrief_stores_result(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    client.put(f"/api/trades/{trade_id}/close", json={"exit_price": 930.0, "debrief": "Done."})
    with patch("backend.services.claude.generate_trade_debrief", return_value="Mock debrief text."):
        resp = client.post(f"/api/trades/{trade_id}/ai-debrief")
    assert resp.status_code == 200
    assert resp.json()["ai_debrief"] == "Mock debrief text."
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_trades.py::test_ai_debrief_requires_closed_trade tests/test_trades.py::test_ai_debrief_stores_result -v
```
Expected: FAIL — route does not exist and `ai_debrief` field missing.

- [ ] **Step 3: Add `ai_debrief` to the Trade model in `backend/models.py`**

Inside the `Trade` class, after the `r_multiple` column:

```python
    ai_debrief = Column(Text, nullable=True)
```

- [ ] **Step 4: Create `backend/services/claude.py`**

```python
import os

_api_key = os.getenv("ANTHROPIC_API_KEY")


def generate_trade_debrief(trade) -> str:
    if not _api_key:
        return "[AI debrief unavailable — set ANTHROPIC_API_KEY to enable]"
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    prompt = f"""You are a professional swing trading coach. Analyze this trade and write a concise debrief.

Trade:
- Symbol: {trade.symbol} | Direction: {trade.direction}
- Entry: ${trade.entry} | Stop: ${trade.stop} | Target: ${trade.target} | Exit: ${trade.exit}
- Shares: {trade.shares} | P&L: ${trade.pnl:.2f} ({trade.r_multiple:.2f}R)
- Setup type: {trade.setup_type or 'Not specified'}
- Plan adherence score: {f"{trade.checklist_score:.0f}%" if trade.checklist_score is not None else "N/A"}
- Pre-trade note: {trade.pre_note or 'None'}

Write exactly 4 short paragraphs:
1. Plan adherence — did the trade match the pre-trade note and checklist?
2. Entry quality — was entry precise and well-timed?
3. Risk management — was the stop structural, sized correctly, and honoured?
4. Key lesson — one specific, actionable observation from this trade.

Be direct and specific. No generic advice."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text
```

- [ ] **Step 5: Extend TradeResponse in `backend/schemas.py`**

In the `TradeResponse` class, add after `r_multiple`:

```python
    ai_debrief: Optional[str] = None
```

- [ ] **Step 6: Update `_to_response` in `backend/routers/trades.py`**

In the `_to_response` dict, add after `r_multiple`:

```python
        "ai_debrief":      t.ai_debrief,
```

- [ ] **Step 7: Add the debrief endpoint to `backend/routers/trades.py`**

Add this import at the top (after existing imports):
```python
from backend.services import claude as claude_service
```

Add this endpoint after `close_trade`:

```python
@router.post("/{trade_id}/ai-debrief", response_model=TradeResponse)
def generate_ai_debrief(
    trade_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trade = db.query(Trade).filter(
        Trade.id == trade_id,
        Trade.user_id == current_user.id,
    ).first()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != "closed":
        raise HTTPException(400, "Trade must be closed before generating a debrief")
    trade.ai_debrief = claude_service.generate_trade_debrief(trade)
    db.commit()
    db.refresh(trade)
    return _to_response(trade)
```

- [ ] **Step 8: Add `ai_debrief` migration in `backend/main.py`**

Inside the lifespan `with engine.connect() as conn:` block, after the `checklist_score` migration:

```python
        if "ai_debrief" not in trade_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN ai_debrief TEXT"))
            conn.commit()
```

- [ ] **Step 9: Run the new tests**

```
pytest tests/test_trades.py -v
```
Expected: all 18 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/services/claude.py backend/models.py backend/schemas.py \
        backend/routers/trades.py backend/main.py tests/test_trades.py
git commit -m "feat: Claude auto-debrief endpoint for closed trades"
```

---

## Task 3: Train Backend — Risk Calculator Drill + Skill Score Update

**Files:**
- Create: `backend/routers/train.py`
- Create: `tests/test_train.py`
- Modify: `backend/schemas.py` — add `RiskCalcSubmit`
- Modify: `backend/main.py` — register train router

The Risk Calculator drill: given `account_size`, `risk_pct`, `entry`, `stop` → user must calculate correct share count.

Formula: `shares = floor((account_size × risk_pct/100) / (entry − stop))`

Scoring: exact = 100, within 5% = 80, within 10% = 60, else = 0.

Skill score update: EMA of last 10 drill scores for the skill, alpha=0.3 (recent result weighted more).

- [ ] **Step 1: Write failing tests**

Create `tests/test_train.py`:

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
_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

auth_module.DEV_BYPASS_AUTH = True


@pytest.fixture(autouse=True)
def reset_db():
    saved = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = lambda: _Session()
    Base.metadata.create_all(bind=_engine)
    from backend.models import User, SkillScore
    import json
    db = _Session()
    user = User(name="T", trading_stage="small_money", time_budget="30min",
                active_skills=json.dumps(["risk_sizing", "entry_timing"]))
    db.add(user)
    db.commit()
    db.refresh(user)
    for skill in ["risk_sizing", "entry_timing"]:
        db.add(SkillScore(user_id=user.id, skill=skill, score=0.0))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved:
        app.dependency_overrides[get_db] = saved
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)

# account_size=50000, risk_pct=1.0, entry=100, stop=95
# stop_distance = 5.0, correct = floor(500 / 5.0) = 100
VALID_SUBMIT = {
    "account_size": 50000,
    "risk_pct": 1.0,
    "entry": 100.0,
    "stop": 95.0,
    "user_answer": 100,
}


def test_get_today_drills_returns_pending():
    resp = client.get("/api/train/today")
    assert resp.status_code == 200
    data = resp.json()
    assert data["drills_needed"] == 2   # 30min → 2 drills
    assert data["drills_completed"] == 0
    assert len(data["drills"]) == 2
    assert all(d["status"] == "pending" for d in data["drills"])


def test_generate_risk_calc():
    resp = client.get("/api/train/drills/risk-calc/generate")
    assert resp.status_code == 200
    data = resp.json()
    for key in ("account_size", "risk_pct", "entry", "stop", "stop_distance"):
        assert key in data
    assert "correct_shares" not in data   # answer not exposed to client


def test_submit_risk_calc_correct():
    resp = client.post("/api/train/drills/risk-calc/submit", json=VALID_SUBMIT)
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct_shares"] == 100
    assert data["score"] == 100.0
    assert data["correct"] is True
    assert "feedback" in data


def test_submit_risk_calc_close():
    # 104 is within 5% of 100
    resp = client.post("/api/train/drills/risk-calc/submit", json={**VALID_SUBMIT, "user_answer": 104})
    assert resp.json()["score"] == 80.0


def test_submit_risk_calc_off():
    resp = client.post("/api/train/drills/risk-calc/submit", json={**VALID_SUBMIT, "user_answer": 200})
    assert resp.json()["score"] == 0.0


def test_submit_updates_skill_score():
    client.post("/api/train/drills/risk-calc/submit", json=VALID_SUBMIT)
    resp = client.get("/api/users/1/skills")
    scores = {s["skill"]: s["score"] for s in resp.json()}
    assert scores["risk_sizing"] > 0.0   # score was updated from 0


def test_today_shows_completed_after_submit():
    client.post("/api/train/drills/risk-calc/submit", json=VALID_SUBMIT)
    data = client.get("/api/train/today").json()
    assert data["drills_completed"] == 1
    completed = [d for d in data["drills"] if d["status"] == "completed"]
    assert len(completed) == 1
    assert completed[0]["score"] == 100.0


def test_submit_invalid_stop():
    resp = client.post("/api/train/drills/risk-calc/submit",
                       json={**VALID_SUBMIT, "stop": 105.0})  # stop > entry
    assert resp.status_code == 400
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_train.py -v
```
Expected: FAIL — `/api/train/` routes do not exist.

- [ ] **Step 3: Add `RiskCalcSubmit` schema to `backend/schemas.py`**

Append at the end:

```python
class RiskCalcSubmit(BaseModel):
    account_size: float
    risk_pct: float
    entry: float
    stop: float
    user_answer: int
```

- [ ] **Step 4: Create `backend/routers/train.py`**

```python
import json
import math
import random
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import User, DrillResult, SkillScore
from backend.schemas import DRILLS_PER_DAY, RiskCalcSubmit

router = APIRouter(prefix="/train", tags=["train"])


@router.get("/today")
def get_today_drills(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today().isoformat()
    completed = db.query(DrillResult).filter(
        DrillResult.user_id == current_user.id,
        DrillResult.date == today,
    ).order_by(DrillResult.created_at).all()

    drills_needed = DRILLS_PER_DAY.get(current_user.time_budget, 2)
    drills = []
    for i, r in enumerate(completed):
        drills.append({
            "index":      i,
            "drill_type": r.drill_type,
            "skill":      r.skill,
            "status":     "completed",
            "score":      r.score,
        })
    for i in range(len(completed), drills_needed):
        drills.append({
            "index":      i,
            "drill_type": "risk_calculator",
            "skill":      "risk_sizing",
            "status":     "pending",
            "score":      None,
        })
    return {
        "date":             today,
        "drills_needed":    drills_needed,
        "drills_completed": len(completed),
        "drills":           drills,
    }


@router.get("/drills/risk-calc/generate")
def generate_risk_calc(current_user: User = Depends(get_current_user)):
    account_size = random.choice([10000, 20000, 25000, 50000, 75000, 100000])
    risk_pct = random.choice([0.5, 1.0, 1.5, 2.0])
    entry = round(random.uniform(20, 500), 2)
    stop_pct = random.uniform(1.0, 8.0) / 100
    stop_distance = round(entry * stop_pct, 2)
    stop = round(entry - stop_distance, 2)
    return {
        "account_size": account_size,
        "risk_pct":     risk_pct,
        "entry":        entry,
        "stop":         stop,
        "stop_distance": stop_distance,
    }


@router.post("/drills/risk-calc/submit")
def submit_risk_calc(
    body: RiskCalcSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stop_distance = round(body.entry - body.stop, 4)
    if stop_distance <= 0:
        raise HTTPException(400, "entry must be greater than stop")

    correct = math.floor((body.account_size * body.risk_pct / 100) / stop_distance)
    deviation = abs(body.user_answer - correct) / correct if correct > 0 else 1.0

    if deviation == 0:
        score = 100.0
    elif deviation <= 0.05:
        score = 80.0
    elif deviation <= 0.10:
        score = 60.0
    else:
        score = 0.0

    if score == 100.0:
        feedback = f"Perfect. {correct} shares is correct."
    elif score >= 80.0:
        diff = body.user_answer - correct
        feedback = f"Close — correct is {correct}. You were {abs(diff)} shares {'high' if diff > 0 else 'low'} (<5% off)."
    elif score >= 60.0:
        feedback = f"Off by {abs(body.user_answer - correct)} shares. Correct: {correct}. Check your stop distance."
    else:
        feedback = f"Incorrect. Correct: {correct} shares. Formula: (account × risk%) ÷ stop_distance."

    result = DrillResult(
        user_id=current_user.id,
        drill_type="risk_calculator",
        skill="risk_sizing",
        score=score,
        date=date.today().isoformat(),
        detail_json=json.dumps({
            "account_size": body.account_size,
            "risk_pct":     body.risk_pct,
            "entry":        body.entry,
            "stop":         body.stop,
            "correct_shares": correct,
            "user_answer":  body.user_answer,
        }),
    )
    db.add(result)
    db.commit()

    _update_skill_score(current_user.id, "risk_sizing", db)

    return {
        "correct_shares": correct,
        "user_answer":    body.user_answer,
        "score":          score,
        "correct":        deviation == 0,
        "feedback":       feedback,
    }


def _update_skill_score(user_id: int, skill: str, db: Session) -> None:
    results = (
        db.query(DrillResult)
        .filter(DrillResult.user_id == user_id, DrillResult.skill == skill)
        .order_by(DrillResult.created_at.desc())
        .limit(10)
        .all()
    )
    if not results:
        return
    scores = [r.score for r in results]
    # EMA, alpha=0.3: most recent result weighted highest
    ema = scores[0]
    for s in scores[1:]:
        ema = 0.3 * ema + 0.7 * s
    new_score = round(min(100.0, max(0.0, ema)), 1)

    row = db.query(SkillScore).filter(
        SkillScore.user_id == user_id,
        SkillScore.skill == skill,
    ).first()
    if row:
        row.score = new_score
        db.commit()
```

- [ ] **Step 5: Register train router in `backend/main.py`**

Add import:
```python
from backend.routers import train as train_router
```

Add registration (after watchlist router):
```python
app.include_router(train_router.router, prefix="/api", dependencies=[Depends(require_auth)])
```

- [ ] **Step 6: Run tests**

```
pytest tests/test_train.py -v
```
Expected: all 8 PASS.

- [ ] **Step 7: Run full suite**

```
pytest tests/ -v
```
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/routers/train.py backend/schemas.py backend/main.py tests/test_train.py
git commit -m "feat: train router — Risk Calculator drill, daily assignment, skill score EMA update"
```

---

## Task 4: Frontend API Client Updates

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Replace `frontend/src/api.js`**

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
    stats: () => request('GET', '/progress/stats'),
  },
  watchlist: {
    list:        ()         => request('GET',    '/watchlist/'),
    add:         (body)     => request('POST',   '/watchlist/', body),
    updateNotes: (id, body) => request('PUT',    `/watchlist/${id}/notes`, body),
    remove:      (id)       => request('DELETE', `/watchlist/${id}`),
  },
  market: {
    quote: (symbol) => request('GET', `/market/quote/${encodeURIComponent(symbol)}`),
  },
  train: {
    today:           ()     => request('GET',  '/train/today'),
    generateRiskCalc: ()    => request('GET',  '/train/drills/risk-calc/generate'),
    submitRiskCalc:  (body) => request('POST', '/train/drills/risk-calc/submit', body),
  },
  me: () => request('GET', '/me'),
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add watchlist, market, train, and trade debrief API methods"
```

---

## Task 5: Watchlist Page

**Files:**
- Modify: `frontend/src/pages/Watchlist.jsx`
- Modify: `frontend/src/styles/globals.css`

Shows all watchlist symbols with live prices (fetched individually), add/remove controls, and an inline notes field.

- [ ] **Step 1: Add Watchlist styles to `frontend/src/styles/globals.css`**

Append at the end:

```css
/* Watchlist */
.wl-table { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.wl-row { display: grid; grid-template-columns: 80px 1fr 90px 90px 1fr auto; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 13px; }
.wl-row:last-child { border-bottom: none; }
.wl-header { background: var(--surface2); color: var(--muted); font-size: 0.75em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.wl-symbol { font-weight: 700; color: var(--text); font-family: monospace; }
.wl-price { font-family: monospace; color: var(--text); }
.wl-chg-pos { color: var(--green); font-family: monospace; font-weight: 600; }
.wl-chg-neg { color: var(--red); font-family: monospace; font-weight: 600; }
.wl-notes-input { background: transparent; border: none; border-bottom: 1px solid var(--border2); color: var(--text2); font-size: 12px; width: 100%; outline: none; padding: 2px 4px; font-family: var(--font); }
.wl-notes-input:focus { border-bottom-color: var(--accent); }
.wl-remove-btn { background: none; border: none; color: var(--dim); cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; }
.wl-remove-btn:hover { color: var(--red); }
.wl-add-row { display: flex; gap: 8px; }
.wl-add-row input { flex: 1; }

/* Train / Drills */
.drill-list { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.drill-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.drill-row:last-child { border-bottom: none; }
.drill-index { width: 24px; height: 24px; border-radius: 50%; background: var(--surface2); border: 1px solid var(--border2); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: var(--muted); flex-shrink: 0; }
.drill-index.done { background: var(--green); border-color: var(--green); color: #fff; }
.drill-info { flex: 1; }
.drill-name { font-weight: 600; color: var(--text); font-size: 13px; }
.drill-skill { font-size: 11px; color: var(--muted); margin-top: 2px; }
.drill-score { font-family: monospace; font-weight: 700; font-size: 13px; }
.drill-start-btn { background: var(--accent); color: #0f1117; border: none; border-radius: 6px; padding: 6px 16px; font-size: 12px; font-weight: 700; cursor: pointer; }
.drill-start-btn:hover { opacity: 0.88; }

/* Risk Calc Drill */
.drill-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.drill-params { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.drill-param { background: var(--surface2); border-radius: 8px; padding: 12px 16px; }
.drill-param-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
.drill-param-value { font-size: 1.3em; font-weight: 700; color: var(--text); font-family: monospace; }
.drill-answer-row { display: flex; gap: 10px; align-items: flex-end; }
.drill-answer-input { flex: 1; background: var(--surface2); border: 2px solid var(--border2); border-radius: 8px; color: var(--text); padding: 12px 16px; font-size: 1.2em; font-family: monospace; outline: none; }
.drill-answer-input:focus { border-color: var(--accent); }
.drill-submit-btn { background: #238636; color: #fff; border: none; border-radius: 8px; padding: 12px 24px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.drill-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.drill-result { border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.drill-result.pass { background: rgba(63,185,80,0.12); border: 1px solid var(--green); }
.drill-result.partial { background: rgba(210,153,34,0.12); border: 1px solid var(--yellow); }
.drill-result.fail { background: rgba(248,81,73,0.12); border: 1px solid var(--red); }
.drill-result-score { font-size: 1.8em; font-weight: 700; font-family: monospace; }
.drill-feedback { font-size: 13px; color: var(--text2); line-height: 1.5; }
.drill-next-btn { background: var(--accent); color: #0f1117; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer; align-self: flex-start; }
```

- [ ] **Step 2: Replace `frontend/src/pages/Watchlist.jsx`**

```jsx
import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

export default function Watchlist() {
  const [items, setItems]     = useState([])
  const [quotes, setQuotes]   = useState({})  // { symbol: quoteData }
  const [loading, setLoading] = useState(true)
  const [addSymbol, setAddSymbol] = useState('')
  const [adding, setAdding]   = useState(false)
  const [error, setError]     = useState('')
  const [notes, setNotes]     = useState({})  // { id: string }

  const reload = useCallback(async () => {
    const data = await api.watchlist.list()
    setItems(data)
    setNotes(Object.fromEntries(data.map(it => [it.id, it.notes || ''])))
    setLoading(false)
    // Fetch quotes for all symbols (fire and forget updates)
    data.forEach(it => {
      api.market.quote(it.symbol)
        .then(q => setQuotes(prev => ({ ...prev, [it.symbol]: q })))
        .catch(() => {})
    })
  }, [])

  useEffect(() => { reload() }, [reload])

  async function handleAdd() {
    const sym = addSymbol.trim().toUpperCase()
    if (!sym) return
    setAdding(true)
    setError('')
    try {
      await api.watchlist.add({ symbol: sym })
      setAddSymbol('')
      await reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id) {
    await api.watchlist.remove(id)
    setItems(prev => prev.filter(it => it.id !== id))
  }

  async function handleNotesBlur(id) {
    await api.watchlist.updateNotes(id, { notes: notes[id] || '' }).catch(() => {})
  }

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div className="page">
      <h2 style={{ color: 'var(--text)', fontWeight: 700 }}>Watchlist</h2>

      {/* Add symbol */}
      <div className="playbook-section">
        <div className="wl-add-row">
          <input
            className="onb-input"
            style={{ fontSize: '0.9em', padding: '8px 12px' }}
            placeholder="Add ticker symbol…"
            value={addSymbol}
            onChange={e => { setAddSymbol(e.target.value.toUpperCase()); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="playbook-add-btn" onClick={handleAdd} disabled={adding || !addSymbol.trim()}>
            {adding ? '…' : 'Add'}
          </button>
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      </div>

      {items.length === 0 ? (
        <div className="placeholder-card">No symbols yet. Add a ticker above.</div>
      ) : (
        <div className="wl-table">
          <div className="wl-row wl-header">
            <div>Symbol</div>
            <div>Price</div>
            <div>Change</div>
            <div>Range</div>
            <div>Notes</div>
            <div />
          </div>
          {items.map(it => {
            const q = quotes[it.symbol]
            const chgClass = !q ? '' : q.change_pct >= 0 ? 'wl-chg-pos' : 'wl-chg-neg'
            return (
              <div key={it.id} className="wl-row">
                <div className="wl-symbol">{it.symbol}</div>
                <div className="wl-price">{q ? `$${q.price.toFixed(2)}` : '—'}</div>
                <div className={chgClass}>
                  {q ? `${q.change_pct >= 0 ? '+' : ''}${q.change_pct.toFixed(2)}%` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                  {q ? `${q.day_low.toFixed(0)}–${q.day_high.toFixed(0)}` : '—'}
                </div>
                <div>
                  <input
                    className="wl-notes-input"
                    value={notes[it.id] ?? ''}
                    onChange={e => setNotes(prev => ({ ...prev, [it.id]: e.target.value }))}
                    onBlur={() => handleNotesBlur(it.id)}
                    placeholder="Setup notes…"
                  />
                </div>
                <button className="wl-remove-btn" onClick={() => handleRemove(it.id)}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build and commit**

```bash
cd frontend && npm run build && cd ..
git add frontend/src/pages/Watchlist.jsx frontend/src/styles/globals.css frontend/dist/
git commit -m "feat: Watchlist page — live prices, add/remove symbols, inline notes"
```

---

## Task 6: Train Page + Risk Calculator Drill UI

**Files:**
- Create: `frontend/src/components/drills/RiskCalcDrill.jsx`
- Modify: `frontend/src/pages/Train.jsx`

The Train page loads today's drills. Clicking "Start" on a pending drill shows the RiskCalcDrill component inline. After submission, it shows the result and a "Next drill" or "Done for today" button.

- [ ] **Step 1: Create `frontend/src/components/drills/RiskCalcDrill.jsx`**

```jsx
import React, { useState, useEffect } from 'react'
import { api } from '../../api'

export default function RiskCalcDrill({ onComplete }) {
  const [params, setParams]   = useState(null)
  const [answer, setAnswer]   = useState('')
  const [result, setResult]   = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.train.generateRiskCalc().then(setParams).catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!params || !answer) return
    setSubmitting(true)
    try {
      const res = await api.train.submitRiskCalc({
        account_size: params.account_size,
        risk_pct:     params.risk_pct,
        entry:        params.entry,
        stop:         params.stop,
        user_answer:  parseInt(answer, 10),
      })
      setResult(res)
    } catch (err) {
      setResult({ error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  if (!params) return <div className="loading">Generating drill…</div>

  const resultClass = !result ? '' : result.score === 100 ? 'pass' : result.score >= 60 ? 'partial' : 'fail'
  const scoreColor  = !result ? '' : result.score === 100 ? 'var(--green)' : result.score >= 60 ? 'var(--yellow)' : 'var(--red)'

  return (
    <div className="drill-card">
      <div>
        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15, marginBottom: 4 }}>
          Risk Calculator
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
          Calculate the correct number of shares to risk exactly the specified percentage of account.
        </div>
      </div>

      <div className="drill-params">
        <div className="drill-param">
          <div className="drill-param-label">Account Size</div>
          <div className="drill-param-value">${params.account_size.toLocaleString()}</div>
        </div>
        <div className="drill-param">
          <div className="drill-param-label">Risk %</div>
          <div className="drill-param-value">{params.risk_pct}%</div>
        </div>
        <div className="drill-param">
          <div className="drill-param-label">Entry Price</div>
          <div className="drill-param-value">${params.entry.toFixed(2)}</div>
        </div>
        <div className="drill-param">
          <div className="drill-param-label">Stop Price</div>
          <div className="drill-param-value">${params.stop.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
        Stop distance: <strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>${params.stop_distance.toFixed(2)}</strong>
        {' '}per share
      </div>

      {!result && (
        <form onSubmit={handleSubmit} className="drill-answer-row">
          <input
            type="number"
            className="drill-answer-input"
            placeholder="Your answer (shares)"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            min={1}
            autoFocus
          />
          <button type="submit" className="drill-submit-btn" disabled={submitting || !answer}>
            {submitting ? 'Checking…' : 'Submit'}
          </button>
        </form>
      )}

      {result && !result.error && (
        <div className={`drill-result ${resultClass}`}>
          <div className="drill-result-score" style={{ color: scoreColor }}>
            {result.score.toFixed(0)}/100
          </div>
          <div className="drill-feedback">{result.feedback}</div>
          <button className="drill-next-btn" onClick={onComplete}>
            {result.correct ? 'Next ›' : 'Try next drill ›'}
          </button>
        </div>
      )}

      {result?.error && (
        <div style={{ color: 'var(--red)', fontSize: 13 }}>{result.error}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace `frontend/src/pages/Train.jsx`**

```jsx
import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import RiskCalcDrill from '../components/drills/RiskCalcDrill'

const DRILL_LABELS = {
  risk_calculator: 'Risk Calculator',
}
const SKILL_LABELS = {
  risk_sizing:          'Risk & Sizing',
  entry_timing:         'Entry Timing',
  chart_reading:        'Chart Reading',
  setup_selection:      'Setup Selection',
  trade_management:     'Trade Management',
  emotional_discipline: 'Emotional Discipline',
}

export default function Train() {
  const [session, setSession]     = useState(null)
  const [activeDrill, setActiveDrill] = useState(null)  // index of active drill
  const [loading, setLoading]     = useState(true)

  const reload = useCallback(() => {
    api.train.today().then(s => { setSession(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  function handleDrillComplete() {
    setActiveDrill(null)
    reload()
  }

  if (loading) return <div className="loading">Loading…</div>

  const allDone = session && session.drills_completed >= session.drills_needed

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2 style={{ color: 'var(--text)', fontWeight: 700 }}>Train</h2>
        {session && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 20, padding: '4px 14px', fontSize: 12, color: 'var(--muted)' }}>
            {session.drills_completed}/{session.drills_needed} today
          </div>
        )}
      </div>

      {allDone && (
        <div style={{ background: 'rgba(63,185,80,0.1)', border: '1px solid var(--green)', borderRadius: 10, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
          <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 15 }}>All drills done for today!</div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Check back tomorrow for new drills.</div>
        </div>
      )}

      {session && activeDrill === null && (
        <div className="drill-list">
          {session.drills.map((drill, i) => (
            <div key={i} className="drill-row">
              <div className={`drill-index${drill.status === 'completed' ? ' done' : ''}`}>
                {drill.status === 'completed' ? '✓' : i + 1}
              </div>
              <div className="drill-info">
                <div className="drill-name">{DRILL_LABELS[drill.drill_type] || drill.drill_type}</div>
                <div className="drill-skill">{SKILL_LABELS[drill.skill] || drill.skill}</div>
              </div>
              {drill.status === 'completed' && (
                <div className="drill-score" style={{
                  color: drill.score === 100 ? 'var(--green)' : drill.score >= 60 ? 'var(--yellow)' : 'var(--red)'
                }}>
                  {drill.score.toFixed(0)}/100
                </div>
              )}
              {drill.status === 'pending' && (
                <button className="drill-start-btn" onClick={() => setActiveDrill(i)}>
                  Start
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {activeDrill !== null && session?.drills[activeDrill]?.drill_type === 'risk_calculator' && (
        <RiskCalcDrill onComplete={handleDrillComplete} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build and commit**

```bash
cd frontend && npm run build && cd ..
git add frontend/src/pages/Train.jsx frontend/src/components/drills/RiskCalcDrill.jsx frontend/dist/
git commit -m "feat: Train page — daily drill list and Risk Calculator drill UI"
```

---

## Task 7: Home — Today's Training Session Card

**Files:**
- Modify: `frontend/src/pages/Home.jsx`

Replaces the placeholder with a real Today's Training card showing drill progress and a "Start" button pointing to the next incomplete drill.

- [ ] **Step 1: Replace the placeholder in `frontend/src/pages/Home.jsx`**

Add `useCallback` to the import line (already has `useState`, `useEffect`) and add the training session fetch. Replace the entire `Home` component:

```jsx
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { api } from '../api'

const PHASE_LABEL = {
  'pre-market':  'Pre-market',
  'market':      'Market Hours',
  'post-market': 'Post-market',
}
const LEVEL_NAMES = ['Beginner', 'Building Edge', 'Developing Edge', 'Consistent Trader', 'Skilled Trader']

function getPhase(now) {
  const h = now.getHours(), m = now.getMinutes()
  if (h < 9 || (h === 9 && m < 30)) return 'pre-market'
  if (h < 16) return 'market'
  return 'post-market'
}

function getWeekBounds() {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

export default function Home() {
  const { user }    = useUser()
  const navigate    = useNavigate()
  const now         = new Date()
  const h           = now.getHours()
  const greeting    = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const phase       = getPhase(now)

  const [trades, setTrades]     = useState([])
  const [session, setSession]   = useState(null)
  const [skills, setSkills]     = useState([])

  useEffect(() => {
    api.trades.list().then(setTrades).catch(() => {})
    api.train.today().then(setSession).catch(() => {})
    api.users.skills(user.id).then(setSkills).catch(() => {})
  }, [user.id])

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

  // Level from avg skill score
  const avgScore = skills.length > 0
    ? skills.reduce((s, sk) => s + sk.score, 0) / skills.length
    : 0
  const level = avgScore < 25 ? 1 : avgScore < 45 ? 2 : avgScore < 65 ? 3 : avgScore < 85 ? 4 : 5

  const allDone = session && session.drills_completed >= session.drills_needed
  const nextPending = session?.drills.find(d => d.status === 'pending')

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Good {greeting}, {user.name}</div>
          <div className="phase-label">{PHASE_LABEL[phase]}</div>
        </div>
        <div className="level-badge">Level {level} · {LEVEL_NAMES[level - 1]}</div>
      </div>

      {/* Today's Training Session */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 12 }}>
          Today's Training Session
        </div>
        {!session ? (
          <div style={{ color: 'var(--dim)', fontSize: 13 }}>Loading…</div>
        ) : allDone ? (
          <div style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>
            ✓ All {session.drills_needed} drills complete for today!
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--text2)', fontSize: 13 }}>
                {session.drills_completed}/{session.drills_needed} drills done
              </div>
              {nextPending && (
                <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>
                  Next: {nextPending.drill_type === 'risk_calculator' ? 'Risk Calculator' : nextPending.drill_type}
                </div>
              )}
            </div>
            <button
              className="drill-start-btn"
              onClick={() => navigate('/train')}
            >
              {session.drills_completed === 0 ? 'Start Training' : 'Continue'}
            </button>
          </div>
        )}
      </div>

      <div className="grid-2">
        {/* Skill Progress */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 12 }}>Skill Progress</div>
          {skills.length === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>No skills tracked yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {skills.slice(0, 4).map(s => (
                <div key={s.skill}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: 'var(--text2)' }}>{s.skill.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--text)', fontFamily: 'monospace', fontWeight: 600 }}>{s.score.toFixed(0)}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.score}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
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
                    {t.symbol}{' '}
                    <span style={{ fontWeight: 400, color: t.direction === 'long' ? 'var(--green)' : 'var(--red)', fontSize: 11, textTransform: 'uppercase' }}>
                      {t.direction}
                    </span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
                    Entry ${t.entry_price.toFixed(2)} · {t.shares} sh · Stop ${t.stop_price.toFixed(2)}
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
          <p style={{ marginTop: 8 }}>Coming in Phase 5.</p>
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

- [ ] **Step 2: Build and commit**

```bash
cd frontend && npm run build && cd ..
git add frontend/src/pages/Home.jsx frontend/dist/
git commit -m "feat: Home — live training session card with drill progress and skill bars"
```

---

## Task 8: Full Test Suite + Push

- [ ] **Step 1: Run all tests**

```
pytest tests/ -v
```
Expected: all tests PASS. Common issues:
- If any test imports something not yet created, check the import paths.
- If `test_trades.py` fails on `ai_debrief` field: verify the migration step in Task 2 was applied and `_to_response` was updated.

- [ ] **Step 2: Final build**

```bash
cd frontend && npm run build && cd ..
```

Verify `frontend/dist/index.html` references the newly built JS file.

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Set ANTHROPIC_API_KEY on Railway**

In Railway dashboard → SwingTrainer service → Variables → Add `ANTHROPIC_API_KEY`.

Without it, the `/api/trades/{id}/ai-debrief` endpoint returns the placeholder string but does not crash.

- [ ] **Step 5: Verify deployment**

Open the Railway URL. Expected:
- Home shows Today's Training Session card with "Start Training" button
- Train tab shows 2 pending drills (for 30min budget), clicking Start shows Risk Calculator
- Watchlist tab shows the add-symbol form
- Journal → Close trade → can call AI debrief (if key is set)

---

## Self-Review

**Spec coverage check:**
- yfinance quote service ✓
- Watchlist: add/remove/notes/live prices ✓
- Risk Calculator drill ✓
- Daily drill assignment ✓
- Skill score update from drills ✓
- Auto-debrief on trade close ✓
- Train tab UI ✓
- Home: Today's Training card ✓
- Home: skill bars ✓
- Home: level badge with real score ✓

**Deferred to Phase 5:**
- Chart Entry drill (needs chart rendering component)
- Setup Validity drill (needs chart rendering)
- Scan Sprint drill (needs chart rendering)
- Trade Autopsy drill (needs 10+ closed trades)
- Watchlist chart launcher
- Training streak tracking
- Pattern detection (Claude re-analysis every 5 trades)
- Module system (theory + quiz)
- AI debrief auto-triggered on close (currently user-initiated via separate call)
