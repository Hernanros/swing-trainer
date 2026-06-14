# Phase 3 — Earnings Dates on Watchlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show upcoming earnings dates on each watchlist row so the user never unknowingly holds through an earnings announcement.

**Architecture:** New `get_next_earnings(symbol)` service function calls Finnhub's free earnings calendar endpoint and caches results in the existing `CachedContent` table (TTL: 24h). A new `GET /api/market/earnings/{symbol}` router endpoint exposes it. A new `EarningsCell` React component in Watchlist mirrors the existing `QuoteCell` pattern — self-contained, fetches its own data, fails silently.

**Tech Stack:** FastAPI, SQLAlchemy (SQLite), Pydantic, pytest, React/Vite, Finnhub free tier

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `backend/services/market.py` | Modify | Add `get_next_earnings(symbol)` |
| `backend/routers/market.py` | Modify | Add `GET /earnings/{symbol}` with 24h DB cache |
| `tests/test_market.py` | Modify | Add 4 tests for earnings service + router |
| `frontend/src/api.js` | Modify | Add `api.market.earnings(symbol)` |
| `frontend/src/pages/Watchlist.jsx` | Modify | Add `EarningsCell` component + render in each row |

---

## Task 1: Earnings Service Function

**Files:**
- Modify: `backend/services/market.py`
- Modify: `tests/test_market.py`

- [ ] **Step 1: Write failing tests**

Add to the bottom of `tests/test_market.py`:

```python
def test_get_next_earnings_returns_date():
    from backend.services.market import get_next_earnings
    fake_response = {
        "earningsCalendar": [
            {"date": "2099-07-25", "symbol": "AAPL", "epsEstimate": 1.2}
        ]
    }
    mock_resp = MagicMock()
    mock_resp.json.return_value = fake_response
    mock_resp.raise_for_status = MagicMock()
    with patch("backend.services.market.requests.get", return_value=mock_resp), \
         patch("backend.services.market._FINNHUB_TOKEN", "fake-token"):
        result = get_next_earnings("AAPL")
    assert result == {"date": "2099-07-25"}


def test_get_next_earnings_raises_when_no_token():
    from backend.services.market import get_next_earnings
    with patch("backend.services.market._FINNHUB_TOKEN", ""):
        try:
            get_next_earnings("AAPL")
            assert False, "Expected ValueError"
        except ValueError as e:
            assert "FINNHUB_TOKEN" in str(e)


def test_get_next_earnings_raises_when_no_upcoming():
    from backend.services.market import get_next_earnings
    fake_response = {"earningsCalendar": []}
    mock_resp = MagicMock()
    mock_resp.json.return_value = fake_response
    mock_resp.raise_for_status = MagicMock()
    with patch("backend.services.market.requests.get", return_value=mock_resp), \
         patch("backend.services.market._FINNHUB_TOKEN", "fake-token"):
        try:
            get_next_earnings("AAPL")
            assert False, "Expected ValueError"
        except ValueError:
            pass
```

Also add `MagicMock` to the existing import at the top of `tests/test_market.py`:
```python
from unittest.mock import patch, MagicMock
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/test_market.py::test_get_next_earnings_returns_date tests/test_market.py::test_get_next_earnings_raises_when_no_token tests/test_market.py::test_get_next_earnings_raises_when_no_upcoming -v
```

Expected: all 3 FAIL with `ImportError` or `AttributeError` — function doesn't exist yet.

- [ ] **Step 3: Implement `get_next_earnings` in `backend/services/market.py`**

Add the following at the bottom of `backend/services/market.py` (after `get_quote`):

```python
def get_next_earnings(symbol: str) -> dict:
    if not _FINNHUB_TOKEN:
        raise ValueError("FINNHUB_TOKEN not configured")
    symbol = symbol.upper()
    url = "https://finnhub.io/api/v1/calendar/earnings"
    r = requests.get(url, params={"symbol": symbol, "token": _FINNHUB_TOKEN}, timeout=10)
    r.raise_for_status()
    data = r.json()
    from datetime import date as date_type
    today = date_type.today().isoformat()
    upcoming = [
        e for e in data.get("earningsCalendar", [])
        if e.get("date", "") >= today
    ]
    if not upcoming:
        raise ValueError(f"No upcoming earnings found for {symbol}")
    upcoming.sort(key=lambda e: e["date"])
    return {"date": upcoming[0]["date"]}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python3 -m pytest tests/test_market.py::test_get_next_earnings_returns_date tests/test_market.py::test_get_next_earnings_raises_when_no_token tests/test_market.py::test_get_next_earnings_raises_when_no_upcoming -v
```

Expected: all 3 PASS.

- [ ] **Step 5: Run full suite to check for regressions**

```bash
python3 -m pytest -q --no-header 2>&1 | tail -3
```

Expected: 87 passed (84 + 3 new)

- [ ] **Step 6: Commit**

```bash
git add backend/services/market.py tests/test_market.py
git commit -m "feat: add get_next_earnings to market service with Finnhub"
```

---

## Task 2: Earnings Router Endpoint + DB Cache

**Files:**
- Modify: `backend/routers/market.py`
- Modify: `tests/test_market.py`

- [ ] **Step 1: Write the failing test**

Add to the bottom of `tests/test_market.py`:

```python
def test_earnings_endpoint_returns_date():
    with patch("backend.routers.market.get_next_earnings", return_value={"date": "2099-07-25"}):
        resp = client.get("/api/market/earnings/AAPL")
    assert resp.status_code == 200
    assert resp.json() == {"date": "2099-07-25"}


def test_earnings_endpoint_caches_in_db():
    with patch("backend.routers.market.get_next_earnings", return_value={"date": "2099-07-25"}):
        client.get("/api/market/earnings/AAPL")
    # Second call — get_next_earnings should NOT be called (served from cache)
    with patch("backend.routers.market.get_next_earnings", side_effect=Exception("should not call")) as mock:
        resp = client.get("/api/market/earnings/AAPL")
        mock.assert_not_called()
    assert resp.status_code == 200
    assert resp.json() == {"date": "2099-07-25"}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python3 -m pytest tests/test_market.py::test_earnings_endpoint_returns_date tests/test_market.py::test_earnings_endpoint_caches_in_db -v
```

Expected: both FAIL with 404 — endpoint doesn't exist yet.

- [ ] **Step 3: Add the earnings endpoint to `backend/routers/market.py`**

Add these imports at the top of `backend/routers/market.py` (after existing imports):

```python
from datetime import datetime, timezone, timedelta
```

Then add the new endpoint at the bottom of `backend/routers/market.py` (after the `candles` endpoint):

```python
@router.get("/earnings/{symbol}")
def earnings(symbol: str, db: Session = Depends(get_db)):
    from backend.services.market import get_next_earnings
    symbol = symbol.upper()
    cache_key = f"earnings:{symbol}"
    now = datetime.now(timezone.utc)
    row = db.query(CachedContent).filter(CachedContent.key == cache_key).first()
    if row:
        age = (now - row.generated_at.replace(tzinfo=timezone.utc)).total_seconds()
        if age < 86400:
            return json.loads(row.content)
    try:
        result = get_next_earnings(symbol)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        _log.exception("Earnings fetch failed for %s", symbol)
        raise HTTPException(503, f"Earnings unavailable for {symbol}: {e}")
    content = json.dumps(result)
    if row:
        row.content = content
        row.generated_at = now
    else:
        db.add(CachedContent(key=cache_key, content=content, generated_at=now))
    db.commit()
    return result
```

Also update the top-level import: `get_next_earnings` will be imported inline (already written above). The existing `from backend.services.market import get_quote, get_candles` line stays as-is.

- [ ] **Step 4: Run tests to verify they pass**

```bash
python3 -m pytest tests/test_market.py::test_earnings_endpoint_returns_date tests/test_market.py::test_earnings_endpoint_caches_in_db -v
```

Expected: both PASS.

- [ ] **Step 5: Run full suite**

```bash
python3 -m pytest -q --no-header 2>&1 | tail -3
```

Expected: 89 passed

- [ ] **Step 6: Commit**

```bash
git add backend/routers/market.py tests/test_market.py
git commit -m "feat: add earnings endpoint with 24h CachedContent TTL"
```

---

## Task 3: Frontend — EarningsCell + Watchlist Integration

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/pages/Watchlist.jsx`

No automated frontend tests — verify visually after implementation.

- [ ] **Step 1: Add `api.market.earnings` to `frontend/src/api.js`**

Find the `market:` block (around line 56):
```js
  market: {
    quote:   (symbol, days) => request('GET', `/market/quote/${encodeURIComponent(symbol)}`),
    candles: (symbol, days = 60, date = null) =>
      request('GET', `/market/candles/${encodeURIComponent(symbol)}?days=${days}${date ? `&date=${date}` : ''}`),
  },
```

Add `earnings` as the last entry:
```js
  market: {
    quote:   (symbol, days) => request('GET', `/market/quote/${encodeURIComponent(symbol)}`),
    candles: (symbol, days = 60, date = null) =>
      request('GET', `/market/candles/${encodeURIComponent(symbol)}?days=${days}${date ? `&date=${date}` : ''}`),
    earnings: (symbol) => request('GET', `/market/earnings/${encodeURIComponent(symbol)}`),
  },
```

- [ ] **Step 2: Add `EarningsCell` component to `frontend/src/pages/Watchlist.jsx`**

Add the following component definition immediately after the `QuoteCell` function (after line 42, before `export default function Watchlist`):

```jsx
function EarningsCell({ symbol }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.market.earnings(symbol)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [symbol])

  if (loading) return <span className="wl-price muted">…</span>
  if (!data?.date) return <span className="wl-price muted" style={{ fontSize: 11 }}>—</span>

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const erDate = new Date(data.date + 'T00:00:00')
  const daysUntil = Math.round((erDate - today) / 86400000)

  if (daysUntil < 0)  return <span className="wl-price muted" style={{ fontSize: 11 }}>—</span>
  if (daysUntil === 0) return <span className="wl-price red"  style={{ fontSize: 11 }}>ER today</span>
  if (daysUntil === 1) return <span className="wl-price red"  style={{ fontSize: 11 }}>ER tomorrow</span>
  return <span className="wl-price" style={{ color: 'var(--yellow)', fontSize: 11 }}>ER in {daysUntil}d</span>
}
```

- [ ] **Step 3: Add the earnings column header**

In `Watchlist.jsx`, find the header row (around line 146):
```jsx
          <div className="wl-header">
            <span>Symbol</span>
            <span>Price / Change</span>
            <span>Notes</span>
            <span />
          </div>
```

Add `<span>Earnings</span>` after `<span>Price / Change</span>`:
```jsx
          <div className="wl-header">
            <span>Symbol</span>
            <span>Price / Change</span>
            <span>Earnings</span>
            <span>Notes</span>
            <span />
          </div>
```

- [ ] **Step 4: Render `EarningsCell` in each watchlist row**

In `Watchlist.jsx`, find the `<QuoteCell symbol={item.symbol} />` line (around line 159). Add `EarningsCell` immediately after it:

```jsx
              <QuoteCell symbol={item.symbol} />
              <EarningsCell symbol={item.symbol} />
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/api.js frontend/src/pages/Watchlist.jsx
git commit -m "feat: add EarningsCell to watchlist with Finnhub earnings dates"
```

---

## Success Criteria

- [ ] Each watchlist row shows an earnings badge (e.g. "ER in 12d" in yellow, "ER tomorrow" in red)
- [ ] Badge shows "—" when no upcoming earnings found or Finnhub token missing
- [ ] Second request for the same symbol within 24h is served from `CachedContent` (no external call)
- [ ] Cache refreshes after 24h
- [ ] 89 backend tests pass
