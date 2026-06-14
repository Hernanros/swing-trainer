# Phase 2 — Historical Chart in Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When reviewing a closed trade in the journal, show the actual OHLC chart centered on the trade entry date, with entry/stop/target/exit price lines.

**Architecture:** Extend the existing `GET /api/market/candles/{symbol}` endpoint with an optional `?date=YYYY-MM-DD` param. Historical results are permanently cached in the `CachedContent` table (already in DB). Add `Trade.trade_date` column (nullable, backward-compatible). New `TradeChart.jsx` component mirrors `DrillChart.jsx` but fetches live data and renders price lines. Journal rows expand on click for closed trades.

**Tech Stack:** FastAPI, SQLAlchemy (SQLite), Pydantic v2, pytest, React/Vite, lightweight-charts v5

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `scripts/migrate_trade_date.py` | Create | One-shot SQLite `ALTER TABLE trades ADD COLUMN trade_date TEXT` |
| `backend/models.py` | Modify | Add `Trade.trade_date = Column(String, nullable=True)` |
| `backend/schemas.py` | Modify | Add `trade_date: Optional[str] = None` to `TradeCreate` and `TradeResponse` |
| `backend/routers/trades.py` | Modify | Set `trade.trade_date` in `open_trade()`; expose it in `_to_response()` |
| `backend/services/market.py` | Modify | Add optional `date` param to `_fetch_twelvedata_candles`, `_fetch_candles`, `get_candles` |
| `backend/routers/market.py` | Modify | Add `date: Optional[str]` + `db: Session` to `candles()`; cache in `CachedContent` |
| `tests/test_market.py` | Create | Tests for date-anchored candles endpoint and caching |
| `tests/test_trades.py` | Modify | Add tests for `trade_date` field |
| `frontend/src/components/TradeChart.jsx` | Create | Lightweight-charts chart with price lines, fetches live data |
| `frontend/src/components/TradeDrawer.jsx` | Modify | Add trade date input (type=date, default=today) to open form |
| `frontend/src/pages/Journal.jsx` | Modify | Expandable rows on closed trades showing TradeChart + debrief + checklist score |
| `frontend/src/api.js` | Modify | Update `api.market.candles` to accept optional `date` param |

---

## Task 1: DB Migration Script + Model Column

**Files:**
- Create: `scripts/migrate_trade_date.py`
- Modify: `backend/models.py:34-58`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_trades.py` (after the existing imports, before first test):

```python
def test_trade_date_column_exists():
    from sqlalchemy import inspect
    from backend.database import engine
    inspector = inspect(engine)
    cols = {c["name"] for c in inspector.get_columns("trades")}
    assert "trade_date" in cols, "trade_date column missing from trades table"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/test_trades.py::test_trade_date_column_exists -v
```

Expected: `FAILED — AssertionError: trade_date column missing from trades table`

- [ ] **Step 3: Add `trade_date` to the Trade model**

In `backend/models.py`, add after line 54 (`ai_debrief = Column(Text, nullable=True)`):

```python
    trade_date = Column(String, nullable=True)
```

The full Trade model column block should now end with:
```python
    ai_debrief = Column(Text, nullable=True)
    trade_date = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python3 -m pytest tests/test_trades.py::test_trade_date_column_exists -v
```

Expected: `PASSED`
Note: the in-memory test DB is rebuilt on each test run from `Base.metadata.create_all()`, so the new column is picked up automatically in tests.

- [ ] **Step 5: Create migration script for the live DB**

Create `scripts/migrate_trade_date.py`:

```python
import sqlite3
import pathlib

db_path = pathlib.Path(__file__).parent.parent / "swing-trainer.db"

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(trades)")
existing_cols = {row[1] for row in cursor.fetchall()}

if "trade_date" not in existing_cols:
    conn.execute("ALTER TABLE trades ADD COLUMN trade_date TEXT")
    conn.commit()
    print("Migration complete: trade_date column added.")
else:
    print("Already migrated: trade_date column already exists.")

conn.close()
```

- [ ] **Step 6: Run migration on local DB**

```bash
python3 scripts/migrate_trade_date.py
```

Expected output: `Migration complete: trade_date column added.`  
(Running twice is safe — it prints "Already migrated" and exits.)

- [ ] **Step 7: Commit**

```bash
git add backend/models.py scripts/migrate_trade_date.py tests/test_trades.py
git commit -m "feat: add trade_date column to trades table"
```

---

## Task 2: Schema + Route Wiring

**Files:**
- Modify: `backend/schemas.py:51-93`
- Modify: `backend/routers/trades.py:30-103`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_trades.py`:

```python
def test_open_trade_with_trade_date_stores_it(user_id):
    body = {**VALID_LONG, "trade_date": "2026-01-15"}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 201
    assert resp.json()["trade_date"] == "2026-01-15"


def test_open_trade_without_trade_date_falls_back_to_date(user_id):
    resp = client.post("/api/trades/", json=VALID_LONG)
    assert resp.status_code == 201
    data = resp.json()
    # trade_date should be set to today's date string (YYYY-MM-DD format)
    assert data["trade_date"] is not None
    assert len(data["trade_date"]) == 10  # YYYY-MM-DD
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python3 -m pytest tests/test_trades.py::test_open_trade_with_trade_date_stores_it tests/test_trades.py::test_open_trade_without_trade_date_falls_back_to_date -v
```

Expected: both FAIL (422 or KeyError — `trade_date` not in schema yet)

- [ ] **Step 3: Add `trade_date` to schemas**

In `backend/schemas.py`, update `TradeCreate` (around line 51):

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
    trade_date: Optional[str] = None         # YYYY-MM-DD; defaults to today if omitted

    model_config = {"str_strip_whitespace": True}
```

Update `TradeResponse` (around line 73) — add `trade_date` after `created_at`:

```python
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
    ai_debrief: Optional[str]
    created_at: datetime
    trade_date: Optional[str] = None
```

- [ ] **Step 4: Wire `trade_date` through the router**

In `backend/routers/trades.py`, update `_to_response()` — add `trade_date` to the returned dict:

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
        "ai_debrief":      t.ai_debrief,
        "created_at":      t.created_at,
        "trade_date":      t.trade_date,
    }
```

In `open_trade()`, after creating the `Trade(...)` object (around line 85), change the `date=` line and add `trade_date=`:

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
        trade_date=body.trade_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        setup_type=body.setup_type or None,
        practice=body.practice,
        checklist_score=body.checklist_score,
    )
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
python3 -m pytest tests/test_trades.py -v
```

Expected: all 22 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/schemas.py backend/routers/trades.py tests/test_trades.py
git commit -m "feat: expose trade_date field in TradeCreate and TradeResponse"
```

---

## Task 3: Market Service — Date-Anchored Candles

**Files:**
- Modify: `backend/services/market.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_market.py`:

```python
import json
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import backend.auth as auth_module
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


app.dependency_overrides[require_auth] = lambda: None
auth_module.DEV_BYPASS_AUTH = True


@pytest.fixture(autouse=True)
def reset_db():
    prior = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)
    if prior is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = prior


client = TestClient(app)

FAKE_CANDLES = [
    {"time": 1700000000, "open": 100.0, "high": 105.0, "low": 98.0, "close": 103.0, "volume": 1000000},
    {"time": 1700086400, "open": 103.0, "high": 108.0, "low": 101.0, "close": 106.0, "volume": 1100000},
]


def test_candles_without_date_returns_data():
    # Patch at get_candles level — avoids env-key guards in service internals
    with patch("backend.services.market.get_candles", return_value=FAKE_CANDLES):
        resp = client.get("/api/market/candles/NVDA")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_candles_with_date_returns_data():
    with patch("backend.services.market.get_candles", return_value=FAKE_CANDLES):
        resp = client.get("/api/market/candles/NVDA?date=2026-01-15&days=60")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_candles_with_date_are_cached_in_db():
    with patch("backend.services.market.get_candles", return_value=FAKE_CANDLES):
        client.get("/api/market/candles/NVDA?date=2026-01-15&days=60")
    # Second call — get_candles should NOT be called (served from DB cache)
    with patch("backend.services.market.get_candles", side_effect=Exception("should not call")) as mock:
        resp = client.get("/api/market/candles/NVDA?date=2026-01-15&days=60")
        mock.assert_not_called()
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_fetch_candles_passes_end_date_to_twelvedata():
    # Unit test: directly verify the service computes end_date = date + 10 days
    from backend.services import market as mkt
    with patch.object(mkt, "_TWELVEDATA_KEY", "fake-key"), \
         patch("backend.services.market._fetch_twelvedata_candles", return_value=FAKE_CANDLES) as mock_td:
        mkt._fetch_candles("NVDA", 60, date="2026-01-15")
    mock_td.assert_called_once_with("NVDA", 60, end_date="2026-01-25")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python3 -m pytest tests/test_market.py -v
```

Expected: all 4 FAIL (candles endpoint doesn't accept `date` yet)

- [ ] **Step 3: Update `_fetch_twelvedata_candles` to accept `end_date`**

Replace the function in `backend/services/market.py` (around line 39):

```python
def _fetch_twelvedata_candles(symbol: str, range_days: int, end_date: str | None = None) -> list[dict]:
    url = "https://api.twelvedata.com/time_series"
    params = {
        "symbol":     symbol,
        "interval":   "1day",
        "outputsize": range_days,
        "apikey":     _TWELVEDATA_KEY,
    }
    if end_date:
        params["end_date"] = end_date
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    d = r.json()
    if d.get("status") == "error" or "values" not in d:
        raise ValueError(f"Twelve Data candles error for {symbol}: {d.get('message', 'unknown')}")
    candles = []
    for row in d["values"]:
        ts = int(datetime.strptime(row["datetime"], "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
        candles.append({
            "time":   ts,
            "open":   round(float(row["open"]),   2),
            "high":   round(float(row["high"]),   2),
            "low":    round(float(row["low"]),    2),
            "close":  round(float(row["close"]),  2),
            "volume": int(float(row.get("volume") or 0)),
        })
    return sorted(candles, key=lambda c: c["time"])
```

- [ ] **Step 4: Update `_fetch_candles` and `get_candles` to accept `date`**

Replace `_fetch_candles` (around line 100):

```python
def _fetch_candles(symbol: str, range_days: int, date: str | None = None) -> list[dict]:
    end_date = None
    if date:
        from datetime import timedelta
        trade_dt = datetime.strptime(date, "%Y-%m-%d")
        end_date = (trade_dt + timedelta(days=10)).strftime("%Y-%m-%d")

    # 1. Twelve Data — primary
    if _TWELVEDATA_KEY:
        try:
            return _fetch_twelvedata_candles(symbol, range_days, end_date=end_date)
        except Exception:
            pass

    # 2. Finnhub fallback
    if _FINNHUB_TOKEN:
        try:
            if date:
                from datetime import timedelta
                trade_dt = datetime.strptime(date, "%Y-%m-%d")
                to_ts = int((trade_dt + timedelta(days=10)).timestamp())
            else:
                to_ts = int(time.time())
            frm = to_ts - range_days * 86400
            url = "https://finnhub.io/api/v1/stock/candle"
            r = requests.get(url, params={
                "symbol": symbol, "resolution": "D",
                "from": frm, "to": to_ts, "token": _FINNHUB_TOKEN,
            }, timeout=10)
            r.raise_for_status()
            d = r.json()
            if d.get("s") == "ok" and d.get("t"):
                return [
                    {"time": t, "open": o, "high": h, "low": l, "close": c, "volume": v}
                    for t, o, h, l, c, v in zip(d["t"], d["o"], d["h"], d["l"], d["c"], d["v"])
                ]
        except Exception:
            pass

    raise ValueError(f"No candle data available for {symbol}")
```

Replace `get_candles` (around line 86):

```python
def get_candles(symbol: str, range_days: int = 60, date: str | None = None) -> list[dict]:
    symbol = symbol.upper()
    if date:
        # historical requests bypass the in-memory cache — router handles DB caching
        return _fetch_candles(symbol, range_days, date=date)

    cache_key = f"{symbol}:{range_days}"
    now = time.time()
    if cache_key in _candle_cache:
        ts, data = _candle_cache[cache_key]
        if now - ts < _CACHE_TTL:
            return data

    candles = _fetch_candles(symbol, range_days)
    _candle_cache[cache_key] = (now, candles)
    return candles
```

- [ ] **Step 5: Run tests**

```bash
python3 -m pytest tests/test_market.py -v
```

Expected: `test_candles_with_date_passes_end_date_to_twelvedata` and `test_candles_without_date_returns_data` PASS; the caching tests still FAIL (caching is in the router, not yet updated).

- [ ] **Step 6: Commit the service changes**

```bash
git add backend/services/market.py tests/test_market.py
git commit -m "feat: add date param to get_candles for historical chart support"
```

---

## Task 4: Market Router — Date Param + DB Cache

**Files:**
- Modify: `backend/routers/market.py`

- [ ] **Step 1: The tests are already written in Task 3 — run them now**

```bash
python3 -m pytest tests/test_market.py::test_candles_with_date_are_cached_in_db tests/test_market.py::test_candles_with_date_returns_data -v
```

Expected: both FAIL (`candles()` doesn't accept `date` yet)

- [ ] **Step 2: Update `backend/routers/market.py`**

Replace the entire file:

```python
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import CachedContent
from backend.services.market import get_quote, get_candles

router = APIRouter(prefix="/market", tags=["market"])
_log = logging.getLogger(__name__)


@router.get("/quote/{symbol}")
def quote(symbol: str):
    try:
        return get_quote(symbol.upper())
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        _log.exception("Quote fetch failed for %s", symbol)
        raise HTTPException(503, f"Quote service unavailable for {symbol}: {e}")


@router.get("/candles/{symbol}")
def candles(
    symbol: str,
    days: int = Query(default=60, ge=5, le=365),
    date: Optional[str] = Query(default=None, description="Trade date anchor YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    symbol = symbol.upper()
    if date:
        cache_key = f"candles:{symbol}:{date}:{days}"
        row = db.query(CachedContent).filter(CachedContent.key == cache_key).first()
        if row:
            return json.loads(row.content)
        try:
            result = get_candles(symbol, days, date=date)
        except ValueError as e:
            raise HTTPException(404, str(e))
        except Exception as e:
            _log.exception("Historical candles fetch failed for %s date=%s", symbol, date)
            raise HTTPException(503, f"Candle data unavailable for {symbol}: {e}")
        db.add(CachedContent(key=cache_key, content=json.dumps(result)))
        db.commit()
        return result

    try:
        return get_candles(symbol, range_days=days)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        _log.exception("Candles fetch failed for %s", symbol)
        raise HTTPException(503, f"Candle data unavailable for {symbol}: {e}")
```

- [ ] **Step 3: Run all market tests**

```bash
python3 -m pytest tests/test_market.py -v
```

Expected: all 4 PASS

- [ ] **Step 4: Run full test suite to check for regressions**

```bash
python3 -m pytest -q --no-header
```

Expected: all tests PASS (25+ tests, 2 warnings)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/market.py
git commit -m "feat: cache historical candles in CachedContent table by date+symbol"
```

---

## Task 5: TradeChart Component

**Files:**
- Create: `frontend/src/components/TradeChart.jsx`

No automated tests — verify visually in Task 7 when journal rows are wired up.

- [ ] **Step 1: Create `frontend/src/components/TradeChart.jsx`**

```jsx
import React, { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries } from 'lightweight-charts'

export default function TradeChart({ symbol, date, entry, stop, target, exit }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [candles, setCandles] = useState(null)

  useEffect(() => {
    if (!symbol || !date) return
    setLoading(true)
    setError(null)
    fetch(`/api/market/candles/${encodeURIComponent(symbol)}?date=${date}&days=60`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then(data => {
        setCandles(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [symbol, date])

  useEffect(() => {
    if (!containerRef.current || !candles) return

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: '#0d1117' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: '#21262d',
        scaleMargins: { top: 0.1, bottom: 0.15 },
      },
      timeScale: { borderColor: '#21262d' },
      handleScroll: false,
      handleScale: false,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor:        '#3fb950',
      downColor:      '#f85149',
      borderUpColor:  '#3fb950',
      borderDownColor:'#f85149',
      wickUpColor:    '#3fb950',
      wickDownColor:  '#f85149',
    })
    series.setData(candles)

    const priceLines = [
      { price: entry, color: '#58a6ff', title: 'Entry' },
      { price: stop,  color: '#f85149', title: 'Stop'  },
      { price: target,color: '#3fb950', title: 'Target'},
    ]
    if (exit != null) {
      priceLines.push({ price: exit, color: '#e3b341', title: 'Exit' })
    }
    priceLines.forEach(({ price, color, title }) => {
      series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: 2,   // dashed
        axisLabelVisible: true,
        title,
      })
    })

    chart.timeScale().fitContent()

    return () => { chart.remove() }
  }, [candles, entry, stop, target, exit])

  if (loading) {
    return (
      <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>
        Loading chart…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ height: 60, display: 'flex', alignItems: 'center', color: 'var(--muted)', fontSize: 12 }}>
        Chart unavailable
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: 240,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #21262d',
      }}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TradeChart.jsx
git commit -m "feat: add TradeChart component with entry/stop/target/exit price lines"
```

---

## Task 6: TradeDrawer — Trade Date Field

**Files:**
- Modify: `frontend/src/components/TradeDrawer.jsx`

- [ ] **Step 1: Add `trade_date` to the form initial state**

In `TradeDrawer.jsx`, find the `useState` for `form` (line 8). Add `trade_date` field:

```js
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
    trade_date:   new Date().toISOString().split('T')[0],
  })
```

- [ ] **Step 2: Add the date input to the open-trade form**

In `TradeDrawer.jsx`, find the line `{field('symbol', 'Symbol', 'text', 'NVDA')}` (line 159) and add the date field immediately after it:

```jsx
            {field('symbol', 'Symbol', 'text', 'NVDA')}

            {field('trade_date', 'Trade Date', 'date')}
```

The `field` helper already handles `type` as its third argument — no other changes needed.

- [ ] **Step 3: Include `trade_date` in the submitted payload**

In `handleSubmit`, find the `data = mode === 'open' ? { ... }` block (around line 89). Add `trade_date`:

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
            }
          : {
              exit_price: +form.exit_price,
              debrief:    form.debrief.trim(),
            }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TradeDrawer.jsx
git commit -m "feat: add trade date picker to TradeDrawer open form"
```

---

## Task 7: Journal — Expandable Rows + Integration

**Files:**
- Modify: `frontend/src/pages/Journal.jsx`
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Update `api.market.candles` to accept optional `date`**

In `frontend/src/api.js`, replace the `candles` line (around line 58):

```js
    candles: (symbol, days = 60, date = null) =>
      request('GET', `/market/candles/${encodeURIComponent(symbol)}?days=${days}${date ? `&date=${date}` : ''}`),
```

- [ ] **Step 2: Add expandedId state and import TradeChart**

In `frontend/src/pages/Journal.jsx`, add the import at the top (after existing imports):

```js
import TradeChart from '../components/TradeChart'
```

Add `expandedId` state alongside the existing state declarations (around line 24):

```js
  const [expandedId, setExpandedId] = useState(null)
```

- [ ] **Step 3: Make closed trade rows clickable**

Replace the `<tr key={t.id} ...>` opening tag (around line 86) with:

```jsx
                  <tr
                    key={t.id}
                    onClick={t.status === 'closed' ? () => setExpandedId(expandedId === t.id ? null : t.id) : undefined}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      verticalAlign: 'middle',
                      cursor: t.status === 'closed' ? 'pointer' : 'default',
                    }}
                  >
```

- [ ] **Step 4: Add expanded detail row after each closed trade row**

After the closing `</tr>` of the trade row (after line 120), add:

```jsx
                  {t.status === 'closed' && expandedId === t.id && (
                    <tr key={`${t.id}-detail`}>
                      <td
                        colSpan={9}
                        style={{ padding: '0 10px 16px', background: 'var(--surface)' }}
                      >
                        <TradeChart
                          symbol={t.symbol}
                          date={t.trade_date || t.created_at.split('T')[0]}
                          entry={t.entry_price}
                          stop={t.stop_price}
                          target={t.target_price}
                          exit={t.exit_price}
                        />
                        {t.ai_debrief && (
                          <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 8 }}>
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>AI Debrief: </span>
                            {t.ai_debrief}
                          </div>
                        )}
                        {t.checklist_score != null && (
                          <div style={{
                            fontSize: 12,
                            marginTop: 6,
                            color: t.checklist_score >= 80
                              ? 'var(--green)'
                              : t.checklist_score >= 50
                                ? 'var(--yellow)'
                                : 'var(--red)',
                          }}>
                            Checklist: {t.checklist_score.toFixed(0)}%
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
```

- [ ] **Step 5: Start dev server and verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
npm --prefix frontend run dev
```

Open http://localhost:5173, navigate to Journal. Verify:
- Closed trade rows show pointer cursor on hover
- Clicking a closed trade expands to show "Loading chart…" then the OHLC chart
- Entry/Stop/Target price lines appear as dashed horizontal lines
- Clicking the same row collapses it
- Open trade rows are not expandable (no cursor change, no expand)
- If AI debrief exists on the trade, it appears below the chart
- If checklist_score exists, it appears color-coded below the debrief

- [ ] **Step 6: Run full backend test suite one final time**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest -q --no-header
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Journal.jsx frontend/src/api.js
git commit -m "feat: expandable journal rows with historical chart and AI debrief"
```

---

## Deployment Checklist

After all tasks complete, deploy to Railway:

- [ ] Run migration on Railway DB (connect via `railway run python3 scripts/migrate_trade_date.py` or shell into the service)
- [ ] Deploy: `railway up --detach` from project root
- [ ] Smoke test on live URL: open a closed trade row, verify chart loads

---

## Success Criteria

- [ ] Clicking a closed trade row expands to show the OHLC chart for the trade date
- [ ] Chart shows entry/stop/target/exit as dashed horizontal price lines
- [ ] AI debrief appears below the chart if present
- [ ] Checklist score appears color-coded below the debrief if present
- [ ] Historical candles are cached in `CachedContent` — second view of the same trade loads instantly
- [ ] New trades have a date picker defaulting to today
- [ ] Existing trades (no `trade_date`) fall back to `created_at` date for the chart
- [ ] Open trade rows are not expandable
- [ ] Full test suite passes (no regressions)
