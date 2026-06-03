# Options Spread Trading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vertical spread options trading to the app — same journal, playbook, and analytics as equity trades, with a type toggle in the entry form and adapted PnL math.

**Architecture:** Five nullable columns are added to the existing `trades` table via the lifespan migration. The `TradeDrawer` renders an equity form or an options form based on `trade_type`. PnL and R-multiple branch on `trade_type` at close. Journal shows a spread type badge and strike/expiry subtitle for option rows. Everything else (playbook, progress, AI patterns, drills) is unchanged.

**Tech Stack:** FastAPI + SQLAlchemy (SQLite), Pydantic v2, React + inline styles

---

## File Structure

| File | Change |
|---|---|
| `backend/models.py` | Add 5 nullable columns to `Trade` |
| `backend/main.py` | Add 5-column migration in lifespan |
| `backend/schemas.py` | Extend `TradeCreate`, `TradeResponse` |
| `backend/routers/trades.py` | `_compute_option_metrics`, extend `_to_response`, update `open_trade` + `close_trade` |
| `tests/test_options.py` | New — 7 backend tests |
| `frontend/src/components/TradeDrawer.jsx` | Type toggle, option form, live info panel, adapted position size helper |
| `frontend/src/pages/Journal.jsx` | Spread type badge, strike/expiry subtitle, expanded detail for options |

---

## Task 1: Trade model + DB migration

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/main.py`
- Test: `tests/test_options.py` (initial scaffold only)

- [ ] **Step 1: Write the failing test**

Create `tests/test_options.py`:

```python
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app, lifespan
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


@pytest.fixture(autouse=True)
def reset_db():
    saved_db = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = lambda: _Session()
    Base.metadata.create_all(bind=_engine)
    db = _Session()
    from backend.models import User
    user = User(
        name="Tester",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=json.dumps(["chart_reading"]),
        email="test@example.com",
    )
    db.add(user)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved_db:
        app.dependency_overrides[get_db] = saved_db
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_trade_model_has_option_columns():
    with _engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(trades)"))]
    for col in ["trade_type", "option_expiry", "option_long_strike", "option_short_strike", "option_spread_type"]:
        assert col in cols, f"Missing column: {col}"
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/test_options.py::test_trade_model_has_option_columns -v
```

Expected: FAIL — columns not in model yet.

- [ ] **Step 3: Add 5 columns to the Trade model**

In `backend/models.py`, add these 5 lines inside the `Trade` class, after `trade_date`:

```python
    trade_type            = Column(String, nullable=False, default="equity")
    option_expiry         = Column(String, nullable=True)
    option_long_strike    = Column(Float,  nullable=True)
    option_short_strike   = Column(Float,  nullable=True)
    option_spread_type    = Column(String, nullable=True)
```

- [ ] **Step 4: Add migration in `backend/main.py`**

In the lifespan block, after the `ai_cols` check (line ~103), add:

```python
        option_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(trades)"))]
        for _col, _typedef in [
            ("trade_type",          "TEXT NOT NULL DEFAULT 'equity'"),
            ("option_expiry",       "TEXT"),
            ("option_long_strike",  "REAL"),
            ("option_short_strike", "REAL"),
            ("option_spread_type",  "TEXT"),
        ]:
            if _col not in option_cols:
                conn.execute(text(f"ALTER TABLE trades ADD COLUMN {_col} {_typedef}"))
                conn.commit()
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
python3 -m pytest tests/test_options.py::test_trade_model_has_option_columns -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/models.py backend/main.py tests/test_options.py
git commit -m "feat: add option spread columns to Trade model and migration"
```

---

## Task 2: Option metrics helper + schema changes

**Files:**
- Modify: `backend/schemas.py`
- Modify: `backend/routers/trades.py`
- Modify: `tests/test_options.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_options.py`:

```python
def test_compute_option_metrics_bull_call():
    from backend.routers.trades import _compute_option_metrics
    from backend.models import Trade
    t = Trade(
        option_spread_type="bull_call",
        option_long_strike=450.0,
        option_short_strike=455.0,
        entry=1.50,
        shares=2,
    )
    m = _compute_option_metrics(t)
    assert m["max_loss"]   == 300.0    # 1.50 * 2 * 100
    assert m["max_profit"] == 700.0    # (5 - 1.50) * 2 * 100
    assert m["breakeven"]  == 451.50   # 450 + 1.50


def test_compute_option_metrics_bear_put():
    from backend.routers.trades import _compute_option_metrics
    from backend.models import Trade
    t = Trade(
        option_spread_type="bear_put",
        option_long_strike=450.0,
        option_short_strike=445.0,
        entry=2.00,
        shares=1,
    )
    m = _compute_option_metrics(t)
    assert m["max_loss"]   == 200.0    # 2.00 * 1 * 100
    assert m["max_profit"] == 300.0    # (5 - 2) * 1 * 100
    assert m["breakeven"]  == 448.0    # 450 - 2.00


def test_compute_option_metrics_bull_put():
    from backend.routers.trades import _compute_option_metrics
    from backend.models import Trade
    t = Trade(
        option_spread_type="bull_put",
        option_long_strike=445.0,
        option_short_strike=450.0,
        entry=1.20,
        shares=1,
    )
    m = _compute_option_metrics(t)
    assert m["max_loss"]   == 380.0    # (5 - 1.20) * 1 * 100
    assert m["max_profit"] == 120.0    # 1.20 * 1 * 100
    assert m["breakeven"]  == 448.80   # 450 - 1.20


def test_compute_option_metrics_bear_call():
    from backend.routers.trades import _compute_option_metrics
    from backend.models import Trade
    t = Trade(
        option_spread_type="bear_call",
        option_long_strike=460.0,
        option_short_strike=455.0,
        entry=1.20,
        shares=1,
    )
    m = _compute_option_metrics(t)
    assert m["max_loss"]   == 380.0    # (5 - 1.20) * 1 * 100
    assert m["max_profit"] == 120.0    # 1.20 * 1 * 100
    assert m["breakeven"]  == 456.20   # 455 + 1.20
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python3 -m pytest tests/test_options.py::test_compute_option_metrics_bull_call -v
```

Expected: FAIL — `_compute_option_metrics` not defined.

- [ ] **Step 3: Add `_compute_option_metrics` to `backend/routers/trades.py`**

Add after the `logger = logging.getLogger(__name__)` line (line ~13):

```python
DEBIT_SPREADS  = {"bull_call", "bear_put"}
VALID_SPREADS  = {"bull_call", "bear_put", "bull_put", "bear_call"}
SPREAD_TO_DIR  = {"bull_call": "long", "bull_put": "long",
                  "bear_put": "short", "bear_call": "short"}


def _compute_option_metrics(trade) -> dict:
    width = abs((trade.option_long_strike or 0) - (trade.option_short_strike or 0))
    entry     = trade.entry
    contracts = trade.shares
    is_debit  = trade.option_spread_type in DEBIT_SPREADS
    if is_debit:
        max_loss   = round(entry * contracts * 100, 2)
        max_profit = round((width - entry) * contracts * 100, 2)
        breakeven  = (
            round(trade.option_long_strike + entry, 4)
            if trade.option_spread_type == "bull_call"
            else round(trade.option_long_strike - entry, 4)
        )
    else:
        max_loss   = round((width - entry) * contracts * 100, 2)
        max_profit = round(entry * contracts * 100, 2)
        breakeven  = (
            round(trade.option_short_strike - entry, 4)
            if trade.option_spread_type == "bull_put"
            else round(trade.option_short_strike + entry, 4)
        )
    return {"max_loss": max_loss, "max_profit": max_profit, "breakeven": breakeven}
```

- [ ] **Step 4: Run the 4 metrics tests to confirm they pass**

```bash
python3 -m pytest tests/test_options.py -k "metrics" -v
```

Expected: 4 PASS.

- [ ] **Step 5: Extend `TradeCreate` in `backend/schemas.py`**

Add these 5 optional fields to the `TradeCreate` class (after `trade_date`):

```python
    trade_type:          str            = "equity"
    option_expiry:       Optional[str]  = None
    option_long_strike:  Optional[float]= None
    option_short_strike: Optional[float]= None
    option_spread_type:  Optional[str]  = None
```

- [ ] **Step 6: Extend `TradeResponse` in `backend/schemas.py`**

Add these 8 optional fields to `TradeResponse` (after `trade_date`):

```python
    trade_type:          str            = "equity"
    option_expiry:       Optional[str]  = None
    option_long_strike:  Optional[float]= None
    option_short_strike: Optional[float]= None
    option_spread_type:  Optional[str]  = None
    max_profit:          Optional[float]= None
    max_loss:            Optional[float]= None
    breakeven:           Optional[float]= None
```

- [ ] **Step 7: Extend `_to_response` in `backend/routers/trades.py`**

Replace the existing `_to_response` function entirely:

```python
def _to_response(t: Trade) -> dict:
    base = {
        "id":                  t.id,
        "symbol":              t.symbol,
        "direction":           t.direction,
        "entry_price":         t.entry,
        "stop_price":          t.stop,
        "target_price":        t.target,
        "exit_price":          t.exit,
        "shares":              t.shares,
        "status":              t.status,
        "pre_note":            t.pre_note or "",
        "debrief":             t.debrief or "",
        "setup_type":          t.setup_type,
        "practice":            bool(t.practice),
        "checklist_score":     t.checklist_score,
        "pnl":                 t.pnl,
        "r_multiple":          t.r_multiple,
        "ai_debrief":          t.ai_debrief,
        "created_at":          t.created_at,
        "trade_date":          t.trade_date,
        "trade_type":          t.trade_type or "equity",
        "option_expiry":       t.option_expiry,
        "option_long_strike":  t.option_long_strike,
        "option_short_strike": t.option_short_strike,
        "option_spread_type":  t.option_spread_type,
        "max_profit":          None,
        "max_loss":            None,
        "breakeven":           None,
    }
    if (t.trade_type or "equity") == "option_spread" and t.option_spread_type:
        base.update(_compute_option_metrics(t))
    return base
```

- [ ] **Step 8: Run full test suite to confirm no regressions**

```bash
python3 -m pytest tests/ -v
```

Expected: all existing tests pass.

- [ ] **Step 9: Commit**

```bash
git add backend/schemas.py backend/routers/trades.py tests/test_options.py
git commit -m "feat: option metrics helper and extended trade schemas"
```

---

## Task 3: Open trade endpoint for options

**Files:**
- Modify: `backend/routers/trades.py`
- Modify: `tests/test_options.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_options.py`:

```python
VALID_SPREAD = {
    "symbol":               "SPY",
    "trade_type":           "option_spread",
    "option_spread_type":   "bull_call",
    "option_expiry":        "2026-07-18",
    "option_long_strike":   450.0,
    "option_short_strike":  455.0,
    "entry_price":          1.50,
    "stop_price":           0.75,
    "target_price":         3.00,
    "shares":               2,
}


def test_open_option_spread_returns_computed_fields():
    resp = client.post("/api/trades/", json=VALID_SPREAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["trade_type"]         == "option_spread"
    assert data["option_spread_type"] == "bull_call"
    assert data["option_expiry"]      == "2026-07-18"
    assert data["option_long_strike"] == 450.0
    assert data["max_loss"]           == 300.0
    assert data["max_profit"]         == 700.0
    assert data["breakeven"]          == 451.50
    assert data["direction"]          == "long"


def test_open_option_spread_missing_expiry_returns_400():
    body = {**VALID_SPREAD, "option_expiry": None}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 400


def test_open_option_spread_missing_spread_type_returns_400():
    body = {**VALID_SPREAD, "option_spread_type": None}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 400


def test_open_option_spread_equal_strikes_returns_400():
    body = {**VALID_SPREAD, "option_short_strike": 450.0}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 400
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python3 -m pytest tests/test_options.py -k "open_option" -v
```

Expected: FAIL.

- [ ] **Step 3: Update `open_trade` in `backend/routers/trades.py`**

Replace the `open_trade` function with this version (all changes are in the validation block and the Trade constructor):

```python
@router.post("/", response_model=TradeResponse, status_code=201)
def open_trade(
    body: TradeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    symbol = body.symbol.upper().strip()
    if not symbol:
        raise HTTPException(400, "symbol is required")
    if body.shares < 1:
        raise HTTPException(400, "shares must be >= 1")
    if body.entry_price <= 0:
        raise HTTPException(400, "entry_price must be > 0")
    if body.target_price <= 0:
        raise HTTPException(400, "target_price must be > 0")

    if body.trade_type == "option_spread":
        if not body.option_spread_type or body.option_spread_type not in VALID_SPREADS:
            raise HTTPException(400, f"option_spread_type must be one of: {sorted(VALID_SPREADS)}")
        if not body.option_expiry:
            raise HTTPException(400, "option_expiry is required for option spreads (YYYY-MM-DD)")
        if body.option_long_strike is None or body.option_long_strike <= 0:
            raise HTTPException(400, "option_long_strike must be > 0")
        if body.option_short_strike is None or body.option_short_strike <= 0:
            raise HTTPException(400, "option_short_strike must be > 0")
        if body.option_long_strike == body.option_short_strike:
            raise HTTPException(400, "option_long_strike and option_short_strike must differ")
        if body.stop_price < 0:
            raise HTTPException(400, "stop_price must be >= 0")
        direction = SPREAD_TO_DIR[body.option_spread_type]
    else:
        if body.direction not in ("long", "short"):
            raise HTTPException(400, "direction must be 'long' or 'short'")
        if body.stop_price <= 0:
            raise HTTPException(400, "stop_price must be > 0")
        if body.stop_price == body.entry_price:
            raise HTTPException(400, "stop_price must not equal entry_price")
        direction = body.direction

    trade = Trade(
        user_id=current_user.id,
        symbol=symbol,
        direction=direction,
        entry=body.entry_price,
        stop=body.stop_price,
        target=body.target_price,
        shares=body.shares,
        pre_note=body.pre_note,
        status="open",
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        trade_date=body.trade_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        setup_type=body.setup_type or None,
        practice=body.practice,
        checklist_score=body.checklist_score,
        trade_type=body.trade_type,
        option_expiry=body.option_expiry,
        option_long_strike=body.option_long_strike,
        option_short_strike=body.option_short_strike,
        option_spread_type=body.option_spread_type,
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return _to_response(trade)
```

- [ ] **Step 4: Run the 4 open-trade tests**

```bash
python3 -m pytest tests/test_options.py -k "open_option" -v
```

Expected: 4 PASS.

- [ ] **Step 5: Run full suite**

```bash
python3 -m pytest tests/ -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/trades.py tests/test_options.py
git commit -m "feat: open trade endpoint supports option spread validation and storage"
```

---

## Task 4: Close trade endpoint for options

**Files:**
- Modify: `backend/routers/trades.py`
- Modify: `tests/test_options.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_options.py`:

```python
def _open_spread(body=None):
    return client.post("/api/trades/", json=body or VALID_SPREAD).json()


def test_close_debit_spread_profit_pnl():
    t = _open_spread()
    resp = client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 3.00, "debrief": "good trade"})
    assert resp.status_code == 200
    data = resp.json()
    # pnl = (3.00 - 1.50) * 2 * 100 = 300
    assert data["pnl"] == 300.0
    assert data["status"] == "closed"


def test_close_debit_spread_loss_pnl():
    t = _open_spread()
    resp = client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 0.50, "debrief": "stopped out"})
    assert resp.status_code == 200
    data = resp.json()
    # pnl = (0.50 - 1.50) * 2 * 100 = -200
    assert data["pnl"] == -200.0


def test_close_credit_spread_profit_pnl():
    body = {
        **VALID_SPREAD,
        "option_spread_type":  "bull_put",
        "option_long_strike":  445.0,
        "option_short_strike": 450.0,
        "entry_price":         1.20,
        "stop_price":          2.40,
        "target_price":        0.30,
        "shares":              1,
    }
    t = _open_spread(body)
    # exit at 0.30 (near worthless) = profit for credit spread
    resp = client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 0.30, "debrief": "expired profitable"})
    assert resp.status_code == 200
    data = resp.json()
    # pnl = (1.20 - 0.30) * 1 * 100 = 90
    assert data["pnl"] == 90.0


def test_close_option_spread_r_multiple():
    t = _open_spread()
    resp = client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 3.00, "debrief": "good"})
    data = resp.json()
    # pnl=300, max_loss = 1.50*2*100 = 300 → r_multiple = 1.0
    assert data["r_multiple"] == 1.0
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python3 -m pytest tests/test_options.py -k "close_" -v
```

Expected: FAIL — PnL still uses equity formula.

- [ ] **Step 3: Update the PnL block in `close_trade` in `backend/routers/trades.py`**

Replace the lines that compute `pnl` and `r_multiple` (currently around lines 131–136):

```python
    exit_price = body.exit_price
    if (trade.trade_type or "equity") == "option_spread":
        is_debit = trade.option_spread_type in DEBIT_SPREADS
        if is_debit:
            pnl = (exit_price - trade.entry) * trade.shares * 100
        else:
            pnl = (trade.entry - exit_price) * trade.shares * 100
        metrics    = _compute_option_metrics(trade)
        r_multiple = round(pnl / metrics["max_loss"], 4) if metrics["max_loss"] else 0.0
    else:
        if trade.direction == "long":
            pnl        = (exit_price - trade.entry) * trade.shares
            r_multiple = (exit_price - trade.entry) / (trade.entry - trade.stop)
        else:
            pnl        = (trade.entry - exit_price) * trade.shares
            r_multiple = (trade.entry - exit_price) / (trade.stop - trade.entry)
```

- [ ] **Step 4: Run the close tests**

```bash
python3 -m pytest tests/test_options.py -k "close_" -v
```

Expected: 4 PASS.

- [ ] **Step 5: Run full suite**

```bash
python3 -m pytest tests/ -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/trades.py tests/test_options.py
git commit -m "feat: close trade uses correct PnL formula for option spreads"
```

---

## Task 5: TradeDrawer — option spread form

**Files:**
- Modify: `frontend/src/components/TradeDrawer.jsx`

This task replaces significant sections of the file. Read it in full before starting.

- [ ] **Step 1: Add option spread fields to the form state**

The current `useState` initialiser for `form` starts at line 9. Add these fields:

```js
  const [form, setForm] = useState({
    symbol:               '',
    direction:            'long',
    entry_price:          '',
    shares:               '',
    stop_price:           '',
    target_price:         '',
    pre_note:             '',
    exit_price:           '',
    debrief:              '',
    setup_type:           '',
    practice:             false,
    trade_date:           new Date().toISOString().split('T')[0],
    trade_type:           'equity',
    option_spread_type:   '',
    option_expiry:        '',
    option_long_strike:   '',
    option_short_strike:  '',
  })
```

- [ ] **Step 2: Add live option metrics computation**

Add this computed value after the existing `suggestedShares` computation (~line 37):

```js
  const optionMetrics = (() => {
    if (form.trade_type !== 'option_spread') return null
    const ls       = Math.abs(+form.option_long_strike - +form.option_short_strike)
    const entry    = +form.entry_price
    const contracts= +form.shares
    const st       = form.option_spread_type
    if (!ls || !entry || !contracts || !st) return null
    const isDebit = ['bull_call', 'bear_put'].includes(st)
    let maxLoss, maxProfit, breakeven
    if (isDebit) {
      maxLoss   = entry * contracts * 100
      maxProfit = (ls - entry) * contracts * 100
      breakeven = st === 'bull_call'
        ? +form.option_long_strike + entry
        : +form.option_long_strike - entry
    } else {
      maxLoss   = (ls - entry) * contracts * 100
      maxProfit = entry * contracts * 100
      breakeven = st === 'bull_put'
        ? +form.option_short_strike - entry
        : +form.option_short_strike + entry
    }
    return {
      maxLoss:   maxLoss.toFixed(2),
      maxProfit: maxProfit.toFixed(2),
      breakeven: breakeven.toFixed(2),
    }
  })()

  const suggestedContracts = (() => {
    if (form.trade_type !== 'option_spread') return 0
    const account = +helperAccount
    const risk    = +helperRisk
    const premium = +form.entry_price
    if (!account || !risk || !premium) return 0
    return Math.floor((account * risk / 100) / (premium * 100))
  })()
```

- [ ] **Step 3: Update the `validate` function to handle options**

Replace the existing `validate` function:

```js
  function validate() {
    const errs = {}
    if (mode === 'open') {
      if (!form.symbol.trim()) errs.symbol = 'Required'
      if (form.trade_type === 'option_spread') {
        if (!form.option_spread_type)             errs.option_spread_type  = 'Required'
        if (!form.option_expiry)                  errs.option_expiry       = 'Required'
        if (!form.option_long_strike  || +form.option_long_strike  <= 0) errs.option_long_strike  = 'Must be > 0'
        if (!form.option_short_strike || +form.option_short_strike <= 0) errs.option_short_strike = 'Must be > 0'
        if (+form.option_long_strike === +form.option_short_strike) errs.option_short_strike = 'Must differ from long strike'
        if (!form.entry_price || +form.entry_price <= 0) errs.entry_price = 'Must be > 0'
        if (+form.stop_price < 0)  errs.stop_price   = 'Must be >= 0'
        if (!form.target_price || +form.target_price <= 0) errs.target_price = 'Must be > 0'
        if (!form.shares || +form.shares < 1) errs.shares = 'Must be >= 1'
      } else {
        if (!['long','short'].includes(form.direction))     errs.direction   = 'Must be long or short'
        if (!form.entry_price  || +form.entry_price  <= 0) errs.entry_price  = 'Must be > 0'
        if (!form.stop_price   || +form.stop_price   <= 0) errs.stop_price   = 'Must be > 0'
        if (!form.target_price || +form.target_price <= 0) errs.target_price = 'Must be > 0'
        if (!form.shares       || +form.shares       < 1)  errs.shares       = 'Must be >= 1'
        if (+form.stop_price   === +form.entry_price)      errs.stop_price   = 'Stop must differ from entry'
      }
    } else {
      if (!form.exit_price || +form.exit_price <= 0) errs.exit_price = 'Must be > 0'
      if (!form.debrief.trim())                      errs.debrief    = 'Required'
    }
    return errs
  }
```

- [ ] **Step 4: Update `handleSubmit` to include option fields**

Replace the open-trade data object in `handleSubmit`:

```js
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
            trade_date:      form.trade_date || null,
            trade_type:      form.trade_type,
            ...(form.trade_type === 'option_spread' && {
              option_spread_type:  form.option_spread_type,
              option_expiry:       form.option_expiry,
              option_long_strike:  +form.option_long_strike,
              option_short_strike: +form.option_short_strike,
            }),
          }
        : {
            exit_price:      +form.exit_price,
            debrief:         form.debrief.trim(),
            checklist_items: rules
              .filter(r => r.tier !== 'context')
              .map(r => ({ rule_id: r.id, checked: !!checked[r.id], tier: r.tier })),
          }
```

- [ ] **Step 5: Add the type toggle + option form to the JSX**

In the `{mode === 'open' && <>` block, replace the opening with:

```jsx
          {mode === 'open' && <>
            {/* Trade type toggle */}
            <div style={{ display: 'flex', gap: 6 }}>
              {['equity', 'option_spread'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('trade_type', t)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: `1px solid ${form.trade_type === t ? 'var(--accent)' : 'var(--border2)'}`,
                    background: form.trade_type === t ? '#58a6ff22' : 'transparent',
                    color: form.trade_type === t ? 'var(--accent)' : 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {t === 'equity' ? 'Equity' : 'Option Spread'}
                </button>
              ))}
            </div>

            {field('symbol', 'Symbol', 'text', form.trade_type === 'option_spread' ? 'SPY' : 'NVDA')}
            {field('trade_date', 'Trade Date', 'date')}
```

- [ ] **Step 6: Add the option-specific fields after trade_date**

After `{field('trade_date', 'Trade Date', 'date')}` and before the Setup Type block, add:

```jsx
            {form.trade_type === 'option_spread' && <>
              {/* Spread type */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)' }}>Spread Type</label>
                <select
                  value={form.option_spread_type}
                  onChange={e => set('option_spread_type', e.target.value)}
                  style={{ background: 'var(--surface2)', border: `1px solid ${errors.option_spread_type ? 'var(--red)' : 'var(--border2)'}`, borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none' }}
                >
                  <option value="">— Select —</option>
                  <option value="bull_call">Bull Call (Debit)</option>
                  <option value="bear_put">Bear Put (Debit)</option>
                  <option value="bull_put">Bull Put (Credit)</option>
                  <option value="bear_call">Bear Call (Credit)</option>
                </select>
                {errors.option_spread_type && <span style={{ color: 'var(--red)', fontSize: 11 }}>{errors.option_spread_type}</span>}
              </div>

              {field('option_expiry', 'Expiration Date', 'date')}

              {/* Strikes side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {field('option_long_strike',  'Long Strike',  'number', '450')}
                {field('option_short_strike', 'Short Strike', 'number', '455')}
              </div>

              {field('entry_price', 'Net Premium / Contract', 'number', '1.50')}

              {/* Size helper for options */}
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  Size Helper <span style={{ fontSize: 10, color: 'var(--dim)' }}>(optional)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)' }}>Account $</label>
                    <input type="number" value={helperAccount} onChange={e => setHelperAccount(e.target.value)} placeholder="25000"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: 13, outline: 'none', width: '100%' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)' }}>Risk %</label>
                    <input type="number" value={helperRisk} onChange={e => setHelperRisk(e.target.value)} placeholder="1"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: 13, outline: 'none', width: '100%' }} />
                  </div>
                </div>
                {suggestedContracts > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                      Suggested: <strong style={{ color: 'var(--text)' }}>{suggestedContracts} contracts</strong>
                      <span style={{ color: 'var(--muted)', marginLeft: 6 }}>= ${(suggestedContracts * +form.entry_price * 100).toFixed(0)} max risk</span>
                    </span>
                    <button type="button" className="btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={() => set('shares', String(suggestedContracts))}>Use</button>
                  </div>
                )}
              </div>

              {field('shares',       'Contracts',       'number', '1')}
              {field('stop_price',   'Stop Premium',    'number', '0.75')}
              {field('target_price', 'Target Premium',  'number', '3.00')}

              {/* Live info panel */}
              {optionMetrics && (
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Max Risk</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', fontFamily: 'monospace' }}>${optionMetrics.maxLoss}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Max Profit</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', fontFamily: 'monospace' }}>${optionMetrics.maxProfit}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Breakeven</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>{optionMetrics.breakeven}</div>
                  </div>
                </div>
              )}
            </>}
```

- [ ] **Step 7: Wrap the equity-only fields in a conditional**

The Direction dropdown, equity size helper, and equity Shares/Stop/Target fields should only show for equity trades. Wrap the block from the Direction `<div>` to the final equity `{field('target_price', ...)}` in:

```jsx
            {form.trade_type === 'equity' && <>
              {/* Direction */}
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

              {field('entry_price', 'Entry Price', 'number', '900.00')}

              {/* Equity size helper */}
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  Size Helper <span style={{ fontSize: 10, color: 'var(--dim)' }}>(optional)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)' }}>Account $</label>
                    <input type="number" value={helperAccount} onChange={e => setHelperAccount(e.target.value)} placeholder="25000"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: 13, outline: 'none', width: '100%' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)' }}>Risk %</label>
                    <input type="number" value={helperRisk} onChange={e => setHelperRisk(e.target.value)} placeholder="1"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: 13, outline: 'none', width: '100%' }} />
                  </div>
                </div>
                {suggestedShares > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                      Suggested: <strong style={{ color: 'var(--text)' }}>{suggestedShares} shares</strong>
                    </span>
                    <button type="button" className="btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={() => set('shares', String(suggestedShares))}>Use</button>
                  </div>
                )}
              </div>

              {field('shares',       'Shares',       'number', '10')}
              {field('stop_price',   'Stop Price',   'number', '885.00')}
              {field('target_price', 'Target Price', 'number', '940.00')}
            </>}
```

Keep the Pre-note textarea and Practice checkbox outside both conditionals so they apply to all trade types.

- [ ] **Step 8: Update the close form summary line**

Replace the summary block at the top of `{mode === 'close' && <>`:

```jsx
            <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              {(trade?.trade_type || 'equity') === 'option_spread' ? (
                <>
                  <div>{trade?.option_spread_type?.replace('_', ' ').toUpperCase()} · {trade?.option_long_strike} / {trade?.option_short_strike} strike · {trade?.shares} contracts</div>
                  <div>Entry ${trade?.entry_price} · Exp: {trade?.option_expiry}</div>
                </>
              ) : (
                <>
                  <div>{trade?.direction?.toUpperCase()} · Entry ${trade?.entry_price} · {trade?.shares} shares</div>
                  <div>Stop ${trade?.stop_price} · Target ${trade?.target_price}</div>
                </>
              )}
            </div>
```

Replace `{field('exit_price', 'Exit Price', 'number', '930.00')}` with:

```jsx
            {field(
              'exit_price',
              (trade?.trade_type || 'equity') === 'option_spread' ? 'Exit Premium' : 'Exit Price',
              'number',
              (trade?.trade_type || 'equity') === 'option_spread' ? '3.00' : '930.00'
            )}
```

- [ ] **Step 9: Build**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend"
npm run build
```

Expected: builds with no errors.

- [ ] **Step 10: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/components/TradeDrawer.jsx
git commit -m "feat: TradeDrawer option spread form with live metrics panel"
```

---

## Task 6: Journal options display

**Files:**
- Modify: `frontend/src/pages/Journal.jsx`

- [ ] **Step 1: Add a helper to format spread info**

Add this helper near the top of `Journal.jsx`, after `fmtPnl`:

```js
const SPREAD_LABELS = {
  bull_call: 'Bull Call',
  bear_put:  'Bear Put',
  bull_put:  'Bull Put',
  bear_call: 'Bear Call',
}

function fmtExpiry(str) {
  if (!str) return ''
  const d = new Date(str + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

- [ ] **Step 2: Add spread type badge to the Symbol cell**

Replace the current symbol `<td>` (currently just `{t.symbol}`):

```jsx
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: 'var(--text)' }}>
                      {t.symbol}
                      {t.trade_type === 'option_spread' && t.option_spread_type && (
                        <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 500, marginTop: 2 }}>
                          {SPREAD_LABELS[t.option_spread_type]}
                          {t.option_long_strike && t.option_short_strike && (
                            <span style={{ color: 'var(--muted)', marginLeft: 4 }}>
                              {t.option_long_strike}/{t.option_short_strike} · {fmtExpiry(t.option_expiry)}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
```

- [ ] **Step 3: Relabel the Dir column for options**

Replace the Direction `<td>`:

```jsx
                    <td style={{ padding: '9px 10px', color: t.direction === 'long' ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', fontSize: 11, fontWeight: 600 }}>
                      {t.direction}
                    </td>
```

- [ ] **Step 4: Add options detail to the expanded row**

In the expanded detail `<td>` (after `t.ai_debrief` and `t.checklist_score` blocks), add:

```jsx
                        {t.trade_type === 'option_spread' && t.option_spread_type && (
                          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            <span><span style={{ color: 'var(--muted)' }}>Spread: </span>{SPREAD_LABELS[t.option_spread_type]}</span>
                            <span><span style={{ color: 'var(--muted)' }}>Strikes: </span>{t.option_long_strike} / {t.option_short_strike}</span>
                            <span><span style={{ color: 'var(--muted)' }}>Expiry: </span>{fmtExpiry(t.option_expiry)}</span>
                            {t.max_loss    != null && <span><span style={{ color: 'var(--muted)' }}>Max Risk: </span><span style={{ color: 'var(--red)', fontFamily: 'monospace' }}>${t.max_loss}</span></span>}
                            {t.max_profit  != null && <span><span style={{ color: 'var(--muted)' }}>Max Profit: </span><span style={{ color: 'var(--green)', fontFamily: 'monospace' }}>${t.max_profit}</span></span>}
                            {t.breakeven   != null && <span><span style={{ color: 'var(--muted)' }}>Breakeven: </span><span style={{ fontFamily: 'monospace' }}>{t.breakeven}</span></span>}
                          </div>
                        )}
```

- [ ] **Step 5: Build**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend"
npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/pages/Journal.jsx
git commit -m "feat: Journal shows spread type badge, strikes, expiry, and expanded option details"
```

---

## Task 7: Full test suite + build + deploy

**Files:**
- Modify: `frontend/dist/` (rebuild)

- [ ] **Step 1: Run full backend test suite**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/ -v
```

Expected: all tests pass. Fix any failures before continuing.

- [ ] **Step 2: Production frontend build**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend"
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit dist**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/dist
git diff --cached --quiet || git commit -m "build: production dist for options spread trading"
```

- [ ] **Step 4: Push to GitHub**

```bash
git push origin master
```

- [ ] **Step 5: Deploy to Railway**

```bash
railway up --detach
```
