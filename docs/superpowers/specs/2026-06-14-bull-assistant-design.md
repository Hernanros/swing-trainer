# Bull Assistant — Design Spec
_2026-06-14_

## Goal

Add a dedicated AI-powered trade discovery assistant to the Swing Trainer app. The Bull Assistant runs a daily top-down pipeline (macro → sector → stock) on closing price data, filters a large options-eligible universe down to scored candidates, computes position sizing against the user's account profile, and presents results on a dedicated page with a follow-up chat interface.

---

## Scope

**In scope:**
- Daily scheduled scan (5 PM ET, weekdays, non-holidays) using EOD closing data
- S&P 500 universe with two-stage pre-filter (technical + options liquidity)
- Claude Haiku batch scoring against Playbook rules + macro + sector context
- Server-side position sizing from saved account profile
- Dedicated `/bull` page: macro bar → sector strip → candidates table → chat
- Options data abstraction layer (yfinance now, Tradier when API key is present)
- Account profile settings (account size, risk per trade %, max contracts)

**Out of scope:**
- Real-time intraday scanning
- Options chain visualization
- Automated order execution
- Multi-user scan broadcasting
- Tradier implementation (stub only — wire when POC proves value)

---

## Architecture

### Pipeline (runs daily at 5 PM ET)

```
1. Macro layer
   - Fetch SPY + QQQ EOD via TwelveData daily time series
   - Compute regime: close vs 50-day SMA → bullish / neutral / bearish
   - Cache: 4 hours (avoids redundant fetches if scheduler retries)

2. Sector layer
   - Fetch 11 SPDR ETFs EOD: XLK, XLF, XLE, XLV, XLY, XLI, XLB, XLRE, XLU, XLC, XLP
   - Rank by % change vs 20-day average close
   - Label each: strong / neutral / weak

3. Screener — Stage 1 (technical, TwelveData EOD)
   - Universe: S&P 500 (~500 symbols, hardcoded list)
   - Filters: close > $15, avg daily volume > 500K shares, close > 50d SMA
   - Output: ~200–250 survivors

4. Screener — Stage 2 (options liquidity, yfinance / Tradier)
   - IVR > 20% (enough premium to sell)
   - ATM open interest > 500 contracts on nearest weekly expiry
   - Bid-ask spread < 15% of mid on front-month ATM
   - Not within 7 days of earnings (use existing Finnhub earnings endpoint)
   - Output: ~40–60 candidates

5. Scoring (Claude Haiku, one batch call)
   - Input: macro context + sector rankings + Playbook rules + snapshot per candidate
   - Score each 0–10 across 5 dimensions (see Scoring Rubric)
   - Output: ranked list with score, rationale summary, suggested spread type

6. Position sizing (server-side, no Claude call)
   - Formula: contracts = min(floor(risk_dollars / max_loss_per_contract), max_contracts)
   - Attached to each scored candidate using saved bull_profile

7. Persist
   - Write one bull_scans row per user per trading day
   - Overwrite if same scan_date exists (idempotent re-run)
```

### Scheduler

`apscheduler` added to `requirements.txt`. Registered in FastAPI lifespan alongside existing migrations. Schedule: `cron(day_of_week='mon-tue-wed-thu-fri', hour=17, minute=0, timezone='America/New_York')`. US market holiday check: hardcoded list of ~10 NYSE holidays per year, updated annually.

---

## Data Model

### `bull_profiles` table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| user_id | INTEGER FK | unique per user |
| account_size | REAL | e.g. 25000.00 |
| risk_per_trade_pct | REAL | e.g. 1.0 (= 1% of account per trade) |
| max_contracts | INTEGER | hard cap per position |
| updated_at | TEXT | ISO-8601 timestamp |

### `bull_scans` table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| scan_date | TEXT | YYYY-MM-DD, unique per user |
| macro_json | TEXT | `{spy: {close, sma50, regime}, qqq: {...}}` |
| sectors_json | TEXT | array of `{symbol, pct_vs_20d, label}` |
| results_json | TEXT | array of scored candidates (see below) |
| created_at | TEXT | when scan ran |

**Candidate object shape (inside results_json):**
```json
{
  "symbol": "AAPL",
  "score": 8.4,
  "rationale": "Strong XLK sector, RSI 52, IVR 34% — favorable for bull put",
  "suggested_spread": "bull_put",
  "entry_price": 185.00,
  "ivr": 34,
  "sector": "XLK",
  "sector_label": "strong",
  "contracts": 3,
  "max_loss": 400,
  "risk_dollars": 1200
}
```

---

## Scoring Rubric (Claude Haiku)

Prompt instructs Claude to score each candidate 0–10 as a sum of 5 dimensions:

| Dimension | Max | What Claude evaluates |
|-----------|-----|----------------------|
| Macro alignment | 2 | SPY/QQQ regime favorable for bullish credit spreads? Bearish macro caps at 1. |
| Sector strength | 2 | Stock's sector in top half of 11 ETFs? Strong = 2, neutral = 1, weak = 0. |
| Playbook fit | 3 | How well does the setup match the user's saved Playbook rules? Exact match = 3, partial = 1–2, miss = 0. |
| Technical quality | 2 | RSI 40–60, close > 50d SMA, trend clarity. |
| Options setup | 1 | IVR elevated enough for premium selling (>30% = 1, 20–30% = 0.5, <20% = 0). |

Prompt is built by `_build_bull_score_prompt(candidates, macro, sectors, playbook_rules)` in `backend/services/bull.py`. Returns XML-delimited scores that the service parses — same pattern as existing `generate_spread_advisory`.

S&P 500 symbol list is a hardcoded constant `SP500_UNIVERSE` in `backend/services/bull.py`, updated manually as needed. Approximately 500 symbols.

---

## Position Sizing

```python
def compute_sizing(candidate, profile):
    max_loss_per_contract = (short_strike - long_strike - premium) * 100
    risk_dollars = profile.account_size * (profile.risk_per_trade_pct / 100)
    contracts = math.floor(risk_dollars / max_loss_per_contract)
    return min(contracts, profile.max_contracts)
```

Strike and premium estimates use current ATM data from the options provider. Sizing is recomputed on `GET /api/bull/scan/latest` using the live profile — not stored independently.

---

## Options Data Abstraction

```python
# backend/services/options.py

class OptionsDataProvider:
    def get_options_snapshot(self, symbol: str) -> dict:
        """Returns ivr, atm_oi, atm_spread, nearest_expiry."""
        raise NotImplementedError

class YFinanceOptionsProvider(OptionsDataProvider):
    """Ships now. Uses yfinance. Free, unofficial, rate-limited."""
    def get_options_snapshot(self, symbol): ...

class TradierOptionsProvider(OptionsDataProvider):
    """Stub. Wire when TRADIER_API_KEY is present."""
    def get_options_snapshot(self, symbol):
        raise NotImplementedError("Set TRADIER_API_KEY to enable Tradier")

def get_options_provider() -> OptionsDataProvider:
    if os.getenv("TRADIER_API_KEY"):
        return TradierOptionsProvider()
    return YFinanceOptionsProvider()
```

Switching to Tradier: add `TRADIER_API_KEY` env var + implement `TradierOptionsProvider`. No changes elsewhere.

---

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/bull/scan/latest` | required | Return today's scan (or most recent if today hasn't run) |
| POST | `/api/bull/scan/run` | required | Manual trigger — runs full pipeline immediately |
| POST | `/api/bull/chat` | required | Follow-up chat; body: `{question, context_symbol?}` |
| GET | `/api/bull/profile` | required | Fetch saved account profile |
| PUT | `/api/bull/profile` | required | Save account size + risk % + max contracts |

---

## Frontend

### New route and nav

- Route: `/bull` added to `App.jsx`
- Sidebar: "Bull" link added to `Sidebar.jsx` (same pattern as existing nav items)

### `Bull.jsx` — page sections (top-down stack)

```
┌─ BULL ASSISTANT ──────────────────────── Last scan: today 5:02 PM ─┐
│                                                                      │
│  [SPY ▲ Bullish]  [QQQ ▲ Bullish]  [VIX — via macro_json]         │
│                                                                      │
│  Sector strip: XLK ▲  XLF ▲  XLV →  XLE ▼  XLY ▲  ...           │
│  (color-coded: green = strong, amber = neutral, red = weak)         │
│                                                                      │
│  Candidates table:                                                   │
│  TICKER  SCORE  SPREAD      CONTRACTS  IVR   SECTOR                │
│  AAPL    8.4    185/180 BP  3          34%   XLK ▲                 │
│  MSFT    7.9    415/410 BP  2          28%   XLK ▲                 │
│  ...                                                                 │
│                                                                      │
│  ┌─ Chat ──────────────────────────────────────────────────────┐   │
│  │ 💬 Ask about any ticker or the overall scan…               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [⚙ Account Profile]  (modal: account size, risk %, max contracts) │
└──────────────────────────────────────────────────────────────────────┘
```

### Chat behavior

- `POST /api/bull/chat` sends: `{question, scan_context (macro + sectors + top 10 candidates by score), symbol?}`
- Claude Sonnet responds — same graceful degradation as existing AI features
- Chat is **in-session only** — not persisted to DB
- Context window for chat includes today's full scan result so Claude can answer "why did X score higher than Y"

### Empty / loading states

- First-time user (no profile): prompt to set account profile before scan results are meaningful
- Scan not yet run today: show last scan date + "Next scan today at 5 PM ET"
- Scan running (manual trigger): spinner with "Running pipeline…"
- No candidates after filtering: "No setups met criteria today — market conditions may be unfavorable"

---

## New Files

**Backend:**
- `backend/routers/bull.py`
- `backend/services/bull.py`
- `backend/services/options.py`
- `backend/models.py` — add `BullProfile`, `BullScan` models
- `backend/main.py` — mount router, lifespan migrations, APScheduler job
- `backend/services/market.py` — extend with `get_sector_etfs()`, EOD batch fetch
- `backend/schemas.py` — `BullProfileSchema`, `BullScanResponse`, `BullChatRequest`

**Frontend:**
- `frontend/src/pages/Bull.jsx`
- `frontend/src/App.jsx` — add `/bull` route
- `frontend/src/components/Sidebar.jsx` — add Bull nav link
- `frontend/src/api.js` — add `bull` namespace

**Tests:**
- `tests/test_bull.py` — endpoint + service tests (in-memory DB, mock Claude + yfinance)

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `TRADIER_API_KEY` | Optional — switches options provider from yfinance to Tradier |

No new required env vars. `ANTHROPIC_API_KEY`, `TWELVEDATA_API_KEY`, and `FINNHUB_TOKEN` already present.

---

## New Branch

All work for Phase 8 lives on `feature/bull-assistant`, branched from `master`.

---

## Success Criteria

1. Daily scan runs automatically at 5 PM ET on trading days and persists results to `bull_scans`
2. `/bull` page shows macro regime, sector rankings, and scored candidates with position sizing
3. Candidates are drawn from S&P 500, filtered for options liquidity (IVR, OI, spread, no earnings)
4. Scores reflect Playbook rules + macro + sector context — not just technicals
5. Chat answers follow-up questions using today's scan as context
6. Account profile (size + risk %) is saved once and applied to all sizing calculations
7. Switching to Tradier requires only adding `TRADIER_API_KEY` env var
8. Equity and options journal flows are unaffected
