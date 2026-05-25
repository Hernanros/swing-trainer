# Phase 2 — Historical Chart in Journal

_Design spec. No new external dependencies — TwelveData already wired._

## Goal

When reviewing a past trade in the journal, show the actual OHLC chart centered on the trade date. Close the core training loop: drill on charts → trade → review the real chart.

---

## Scope

**In scope:**
- Add `date` param to candles endpoint; cache historical results permanently in `CachedContent`
- Add `Trade.trade_date` column + date picker in TradeDrawer
- Expandable journal rows: click a closed trade to reveal chart + AI debrief + checklist score
- New `TradeChart` component: fetches live candles, renders with entry/stop/target/exit price lines

**Out of scope:**
- yfinance (TwelveData already works)
- Volume bars on the chart
- Any changes to the Watchlist, Curriculum, or Train pages

---

## 1. Backend — Historical candles with date support

### 1A. `backend/services/market.py`

`_fetch_twelvedata_candles(symbol, range_days, end_date=None)` gains an optional `end_date: str` param (format `YYYY-MM-DD`). When provided, adds `end_date=end_date` to TwelveData request params — the API supports this natively.

`_fetch_candles(symbol, range_days, date=None)` and `get_candles(symbol, range_days=60, date=None)` gain the same optional `date` param and pass it through. When `date` is provided, the function computes `end_date = date + 10 calendar days` (gives a few days past the trade for context), then fetches `range_days` bars ending there.

Finnhub fallback: compute Unix timestamps `to = date_ts + 10*86400`, `from = to - range_days*86400`.

The existing in-memory `_candle_cache` is unchanged and still used for the no-date path.

### 1B. `backend/routers/market.py`

`candles` endpoint gains:
- `date: Optional[str] = Query(None)` — trade date anchor, format `YYYY-MM-DD`
- `db: Session = Depends(get_db)` — for cache read/write

**Logic:**
```
if date provided:
    key = f"candles:{symbol}:{date}:{days}"
    check CachedContent for key
    → if hit: return json.loads(row.content)
    → if miss: call get_candles(symbol, days, date)
              store result in CachedContent(key=key, content=json.dumps(result))
              return result
else:
    existing in-memory path unchanged
```

Historical candle data is immutable — no expiry on cached rows.

---

## 2. Schema + DB — Trade date field

### 2A. `backend/models.py`

```python
trade_date = Column(String, nullable=True)
```

Added to `Trade`. Nullable so all existing rows are unaffected.

### 2B. `backend/schemas.py`

```python
trade_date: Optional[str] = None   # added to TradeCreate and TradeResponse
```

### 2C. `backend/routers/trades.py`

In `open_trade()`, set `trade.trade_date = body.trade_date or trade.date` so the field is always populated on new trades. Existing trades keep `trade_date = NULL`; the frontend falls back to `created_at` date when `trade_date` is null.

`_to_response()` must also include `"trade_date": t.trade_date` in the returned dict so the field reaches the frontend.

### 2D. `scripts/migrate_trade_date.py`

One-shot migration for the live DB:
```python
import sqlite3, pathlib
db_path = pathlib.Path(__file__).parent.parent / "swing-trainer.db"
conn = sqlite3.connect(db_path)
conn.execute("ALTER TABLE trades ADD COLUMN trade_date TEXT")
conn.commit()
conn.close()
print("Migration complete.")
```

Run once: `python3 scripts/migrate_trade_date.py`

---

## 3. Frontend — TradeDrawer date field

### 3A. `frontend/src/components/TradeDrawer.jsx`

Add an optional date input to the "open trade" form. Field label: "Trade Date". Input type `date`, default value = today (`new Date().toISOString().split('T')[0]`). Submitted as `trade_date` in the form body. Only shown in `mode === 'open'`.

---

## 4. Frontend — TradeChart component

### 4A. `frontend/src/components/TradeChart.jsx` (new file)

Props: `{ symbol, date, entry, stop, target, exit }`

On mount, fetches `GET /api/market/candles/{symbol}?date={date}&days=60`. Shows a loading spinner while pending. On error, shows a muted "Chart unavailable" message (never crashes the row).

Renders with lightweight-charts (same config as `ChartModal`):
- Candlestick series: OHLC data
- 4 horizontal price lines via `series.createPriceLine(...)`:
  - Entry: blue (`#58a6ff`), label "Entry"
  - Stop: red (`#f85149`), label "Stop"
  - Target: green (`#3fb950`), label "Target"
  - Exit: orange (`#e3b341`), label "Exit" — only rendered if `exit != null`

Chart height: 240px. `autoSize: true`. `handleScroll: false`, `handleScale: false` (matches DrillChart). `timeScale().fitContent()` after data loads.

---

## 5. Frontend — Expandable journal rows

### 5A. `frontend/src/pages/Journal.jsx`

Add `const [expandedId, setExpandedId] = useState(null)`.

Each closed trade row (`t.status === 'closed'`) gains:
- `onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}` — toggles
- `style={{ cursor: 'pointer' }}` and a subtle hover background

After each closed trade row, conditionally render an expanded detail row:
```jsx
{expandedId === t.id && (
  <tr>
    <td colSpan={9} style={{ padding: '0 10px 16px', background: 'var(--surface)' }}>
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
        <div style={{ fontSize: 12, marginTop: 6, color: t.checklist_score >= 80 ? 'var(--green)' : t.checklist_score >= 50 ? 'var(--yellow)' : 'var(--red)' }}>
          Checklist: {t.checklist_score.toFixed(0)}%
        </div>
      )}
    </td>
  </tr>
)}
```

Open trades are not expandable — no chart to show yet.

---

## Files changed

| File | Change |
|------|--------|
| `backend/services/market.py` | Add `date`/`end_date` param to candle fetchers |
| `backend/routers/market.py` | Add `date` query param + DB cache logic |
| `backend/models.py` | Add `Trade.trade_date` column |
| `backend/schemas.py` | Add `trade_date` to `TradeCreate` and `TradeResponse` |
| `backend/routers/trades.py` | Set `trade.trade_date` in `open_trade()` |
| `scripts/migrate_trade_date.py` | One-shot SQLite migration (new file) |
| `frontend/src/components/TradeChart.jsx` | New chart component (new file) |
| `frontend/src/components/TradeDrawer.jsx` | Add trade date input |
| `frontend/src/pages/Journal.jsx` | Expandable rows + TradeChart integration |

No new npm packages. No new Python packages. No Railway env vars needed.

---

## Success criteria

- Clicking a closed trade row expands it to show the OHLC chart for the trade date
- Chart shows entry/stop/target/exit as horizontal price lines
- AI debrief appears below chart if present
- Checklist score appears color-coded if present
- Historical candles are cached in DB — second view of the same trade is instant
- New trades have a date picker defaulting to today
- Existing trades (no `trade_date`) fall back to `created_at` date for the chart
- Open trade rows are not expandable
