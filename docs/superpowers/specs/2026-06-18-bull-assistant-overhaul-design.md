# Bull Assistant Overhaul — Design Spec

**Date:** 2026-06-18
**Status:** Approved
**Branch:** feature/bull-assistant (extend existing)

---

## Problem Statement

The current Bull Assistant fails across five dimensions:

1. **Accuracy** — screener finds technically trending stocks but not bull put spread setups (no channel detection, no support proximity, no options quality gate)
2. **Scoring** — Claude Haiku batch scoring produces compressed, undifferentiated scores because all 15 candidates passed the same loose filter; missing IV/OI data makes scores meaningless
3. **Communication** — flat table rows give insufficient context to act; missing data is silently passed rather than flagged
4. **Automation** — no self-logging, no outcome tracking; usefulness is perceived, not measured
5. **Intelligence** — no feedback loop; the system never learns from what works

---

## Design Principles

- **Deterministic first, AI second.** Score candidates with code, not Claude. Claude writes the brief, not the score.
- **No null data forward.** Every candidate carries an explicit data quality flag. Nulls are shown, not hidden.
- **Collapsed by default.** KPI sections do not distract from the primary workflow — finding setups.
- **Provider abstraction from day one.** The options data source is swappable via config, never hardcoded.
- **Empirical over perceived.** The system logs its own recommendations and tracks outcomes.

---

## User's Setup Criteria (source of truth for screener design)

The user looks for:
1. **Macro**: Bullish market, or credible reversal signal (sector rotation, positive news, RSI turning from oversold)
2. **Chart pattern**: Stock in an upward channel, floating near the **bottom** of the channel (at support, not extended)
3. **Momentum**: RSI slope positive (turning upward) — direction matters more than absolute value
4. **Volume**: Healthy confirming volume (above or near 20d average)

**Options style**: ATM or slightly ITM short put, weekly expiry (5-7 DTE), aggressive credit collection. Prioritizes frequent small-medium winners over milking one trade. Spread width: $5 default.

---

## Architecture Overview

```
S&P 500 universe (~450)
        │
        ▼
Stage 1: Technical filter (yfinance batch)
  Channel detection + RSI slope + volume
        │ ~20 survivors
        ▼
Stage 2: Options quality check (yfinance per-ticker)
  Weekly expiry available + ATM put bid > $0.30 + OI > 200
        │ 5-8 complete candidates
        ▼
Deterministic scoring (0-100, no Claude)
        │
        ▼
Claude Sonnet: setup brief (2-3 sentences per candidate)
        │
        ▼
Frontend: ranked table + expandable rows
        │
        ▼
Auto paper trade logger → KPI tracking → (Sprint 2) ML feedback
```

---

## Sprint 1: Core System

### 1. Data Layer — `backend/services/data.py` (new file)

**OptionsProvider interface:**

```python
class OptionsProvider(ABC):
    def get_chain(self, symbol: str, expiry: str) -> dict:
        """Returns: {strikes: [...], puts: [{strike, bid, ask, oi, iv}]}"""

    def get_nearest_weekly_expiry(self, symbol: str) -> str | None:
        """Returns nearest weekly expiry ≥ 5 DTE as YYYY-MM-DD, or None."""
```

**Implementations:**

| Class | Status | Notes |
|---|---|---|
| `YFinanceOptionsProvider` | POC (now) | Per-ticker, not batch. More reliable than batch. IV estimated from bid/ask mid via Black-Scholes when yfinance IV is zero/null. |
| `TradierOptionsProvider` | Stub (now), live post-POC | Reads `TRADIER_API_KEY` env var. Swap by setting the key — no other code change. |
| `IBKRClientPortalProvider` | Future stub | Complex auth, worth it after Tradier proves the model |

**Technical data**: `yfinance.download()` batch call unchanged — this works well for daily OHLC/volume on S&P 500.

**Data quality flag** — every candidate carries one of three values:
- `complete` — all fields populated, confidence high
- `partial` — price/technicals available, options data incomplete
- `price_only` — technicals only, options unavailable

Claude only writes briefs for `complete` candidates. `partial` gets a yellow warning icon. `price_only` is grayed and listed last.

---

### 2. Screener Algorithm — `backend/services/bull.py` (rewrite)

#### Universe
S&P 500 (~450 symbols). No artificial cap to 75. The technical stage is fast (batch download), so running all 450 is feasible. The options stage runs on top ~20 survivors only.

#### Stage 1: Technical Filter

For each symbol, computed from 30 days of daily OHLC:

**Channel detection:**
- Fit linear regression on 20-day rolling highs → upper channel line
- Fit linear regression on 20-day rolling lows → lower channel line
- **Pass criteria**: (a) channel slope > 0 (upward direction), (b) current price is within 10% above the lower channel line (near support, not extended mid-channel or at top)

```python
def _channel_proximity(closes, highs, lows) -> dict:
    """Returns: {slope: float, proximity_pct: float, passes: bool}"""
    # Linear regression via numpy polyfit on last 20 days
    upper = np.polyfit(range(20), highs[-20:], 1)
    lower = np.polyfit(range(20), lows[-20:], 1)
    channel_slope = lower[0]  # slope of lower band
    lower_val = np.polyval(lower, 19)  # lower band today
    upper_val = np.polyval(upper, 19)
    proximity_pct = (closes[-1] - lower_val) / (upper_val - lower_val)
    # proximity_pct: 0 = at lower band, 1 = at upper band
    passes = channel_slope > 0 and proximity_pct <= 0.25
    return {"slope": channel_slope, "proximity_pct": proximity_pct, "passes": passes}
```

**RSI slope:**
- Compute RSI(14) for last 5 days
- **Pass criteria**: slope of RSI over last 3 bars is positive (turning upward)
- Component score: slope magnitude (stronger turn = higher score)

**Volume:**
- **Pass criteria**: last bar volume ≥ 80% of 20-day average
- Soft filter — doesn't eliminate, reduces score if weak

**Price/liquidity floor**: close > $15, avg_volume_20d > 500k (unchanged, sensible floor)

**Stage 1 output**: top 20 by channel proximity score (closest to lower band with positive slope)

#### Stage 2: Options Quality Check (per-ticker, not batch)

For each Stage 1 survivor, call `options_provider.get_nearest_weekly_expiry(symbol)`:
- Require nearest weekly expiry with 5–10 DTE. If no expiry falls in that window (e.g., holiday week shifts dates), expand to 5–14 DTE before giving up.
- Fetch the puts chain for that expiry
- Find ATM put (strike closest to current price)
- **Pass criteria**: ATM put bid ≥ $0.30, OI ≥ 200
- If no expiry found at all → `data_quality = price_only`, skip options fields
- Record: short_strike (ATM), long_strike (ATM − 5), estimated credit (bid × 0.85 to simulate realistic fill), OI, IV (or computed from bid/ask mid via Black-Scholes)
- Assign `data_quality = complete | partial | price_only`

**Stage 2 output**: 5-8 candidates with complete or partial options data, sorted by channel proximity

#### Deterministic Score (0–100)

Replaces Claude Haiku batch scoring entirely. Computed from verifiable data:

| Component | Max pts | Logic |
|---|---|---|
| Channel proximity | 25 | Linear: 25 pts at lower band (0%), 0 pts at 25%+ |
| RSI slope | 20 | Linear: 20 pts at slope ≥ +3, 0 pts at ≤ 0 |
| Volume ratio | 15 | 15 pts if ≥ 1.2× avg, 10 pts if 0.8–1.2×, 0 pts below |
| Macro alignment | 20 | 20 pts if SPY + QQQ both bullish, 10 pts one bullish, 0 pts bearish |
| Options quality | 20 | 20 pts if OI ≥ 500 + bid ≥ $0.50, 12 pts if OI ≥ 200 + bid ≥ $0.30, 0 pts partial/missing |

Score is deterministic, reproducible, and explainable. Every point is traceable to a data field.

#### Claude's New Role: Setup Brief

Claude Sonnet writes a **2-3 sentence qualitative brief** per `complete` candidate — not a score, not a judgment, just: why this setup makes sense today given market conditions. Prompt focuses on: channel position, RSI context, sector alignment, and what to watch.

```python
def generate_setup_brief(candidate: dict, macro: dict, sectors: list) -> str:
    """2-3 sentences. Plain text. No score. No rating. Qualitative only."""
```

Uses `claude-sonnet-4-6`, max_tokens=150. One call per candidate (not batch), parallelized.

---

### 3. Paper Trade Auto-Logger

#### Model — `backend/models.py` addition

```python
class PaperBullTrade(Base):
    __tablename__ = "paper_bull_trades"
    id              = Column(Integer, primary_key=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    scan_id         = Column(Integer, ForeignKey("bull_scans.id"), nullable=False)
    symbol          = Column(String, nullable=False)
    logged_at       = Column(DateTime, default=datetime.utcnow)
    expiry          = Column(String, nullable=False)       # YYYY-MM-DD
    short_strike    = Column(Float, nullable=False)
    long_strike     = Column(Float, nullable=False)
    premium_credit  = Column(Float, nullable=False)       # per share
    score           = Column(Integer, nullable=False)     # 0-100 deterministic
    data_quality    = Column(String, default="complete")
    channel_proximity = Column(Float)                     # 0-1
    rsi_slope       = Column(Float)
    macro_regime    = Column(String)                      # bullish/neutral/bearish
    outcome         = Column(String)                      # win/loss/open
    pnl             = Column(Float)                       # realized credit or loss
    resolved_at     = Column(DateTime)
    auto_logged     = Column(Boolean, default=True)       # false if user manually added
```

#### Auto-logging behavior

When `run_pipeline()` completes, automatically create `PaperBullTrade` rows for **all `complete` candidates with score ≥ 60**. This is not optional — every qualifying setup gets logged without user action. The user doesn't have to click anything.

On expiry date (via APScheduler job, daily at 4:30 PM ET):
- Fetch final close price for each open `PaperBullTrade` with `expiry = today`
- If `final_price > short_strike`: outcome = `win`, pnl = `premium_credit × 100`
- If `final_price ≤ short_strike`: outcome = `loss`, pnl = `-(spread_width - premium_credit) × 100`
- Set `resolved_at = now`

#### Manual paper trade button

The "Auto-log Paper Trade" button in the expanded row lets the user explicitly log a lower-scored candidate they want to track. Same model, `auto_logged = False`.

---

### 4. KPI Engine — `backend/routers/bull.py` additions

`GET /api/bull/kpis` returns:

```json
{
  "total_trades": 23,
  "open_trades": 2,
  "win_rate": 0.71,
  "expectancy_per_dollar": 0.68,
  "score_edge": {
    "high": {"threshold": 80, "win_rate": 0.82, "count": 9},
    "mid":  {"threshold": 60, "win_rate": 0.67, "count": 12},
    "low":  {"threshold": 0,  "win_rate": 0.50, "count": 2}
  },
  "total_pnl": 1840.0
}
```

`GET /api/bull/paper-trades` returns paginated log, newest first.

---

### 5. Frontend — `Bull.jsx` (rewrite)

**Page structure (top to bottom):**

```
[BULL ASSISTANT header + Run Scan button]
[▼ Performance (collapsed by default)]   ← 4-number KPI strip, click to expand
[MacroBar]
[SectorStrip]
[Candidates Table]                       ← ranked, expandable rows
[Chat Panel]
```

**KPI strip** — collapsed by default, one click expands. Shows: Paper Trades logged · Win Rate · Expectancy per $1 risked · Score Edge. Link to Progress for full breakdown.

**Candidates table columns:**

| TICKER | SCORE | CHANNEL | RSI↑ | OPTIONS | BRIEF |
|---|---|---|---|---|---|

- CHANNEL: how close to lower band ("▼8% low" in green, "▼18% low" in yellow)
- RSI↑: slope value, color-coded positive/weak/flat
- OPTIONS: ● complete (green) · ◑ partial (yellow) · ○ price only (gray)
- BRIEF: first 60 chars of AI brief, truncated with ellipsis

**Expanded row contains:**
1. Score breakdown — 5 horizontal progress bars (one per component, pts/max)
2. AI brief — full 2-3 sentence qualitative text
3. Strike cards — Short Put · Long Put · Expiry · Credit · IV
4. Data quality warning if partial
5. Buttons: "Auto-log Paper Trade" · "Dismiss"

**Data quality rules in the table:**
- `complete` candidates: full color, appear at top
- `partial` candidates: yellow ◑, appear below complete
- `price_only` candidates: grayed, appear last with note "Options data unavailable — verify in OptionStrat before trading"

---

### 6. Frontend — `Progress.jsx` additions

New **"Bull Performance"** section, collapsed by default. Toggle to expand.

**Expanded contents:**
- Win rate by score band (horizontal bar chart, color-coded)
- Paper trade log table: Date · Ticker · Spread · Credit · Score · Outcome · P&L
- Score correlation note (is higher score predictive?)
- Sprint 2 placeholder: "ML Confidence Score — unlocks after 50 paper trades"

---

## Sprint 2: Intelligence Layer

**Trigger**: 50+ resolved paper trades (mix of wins and losses).

### ML Scoring — `backend/services/bull_ml.py` (new file)

**Feature vector per paper trade:**
```
channel_proximity, rsi_slope, volume_ratio, macro_regime (encoded),
sector_label (encoded), options_quality (encoded), day_of_week,
days_to_expiry, score (deterministic)
```

**Target**: `outcome` (win=1, loss=0)

**Model progression:**
1. **Logistic regression** (scikit-learn, interpretable) — first 50-150 trades
2. **Gradient boosting** (XGBoost) — 150+ trades, captures non-linear interactions
3. **RL agent** (future) — state = market conditions, action = recommend/skip, reward = P&L

**Retraining**: APScheduler job, weekly on Sunday. Saves model to `backend/ml/bull_model.pkl`.

**Integration**: ML confidence (0.0–1.0) becomes a 5th column in the candidates table. Shown as "ML" column with a confidence percentage. Only shown once model is trained. Candidates are re-ranked by `0.6 × deterministic_score + 0.4 × ml_confidence` when ML is available.

**Minimum data guardrail**: if fewer than 50 resolved trades exist, ML column is hidden and retraining is skipped.

---

## Data Flow Summary

```
Daily scan (5 PM ET, APScheduler):
  1. yfinance batch → S&P 500 technicals
  2. channel + RSI slope + volume → top 20
  3. YFinanceOptionsProvider per-ticker → 5-8 complete candidates
  4. deterministic_score() → 0-100 per candidate
  5. generate_setup_brief() → Claude Sonnet per candidate (parallel)
  6. save BullScan to DB
  7. auto-log PaperBullTrades for score ≥ 60 + complete data

Daily expiry resolution (4:30 PM ET, APScheduler):
  1. find open PaperBullTrades expiring today
  2. fetch final close via yfinance
  3. compute outcome + pnl
  4. update DB

Weekly ML retrain (Sunday, APScheduler):
  1. load all resolved PaperBullTrades
  2. if count ≥ 50: train + save model
  3. if count < 50: skip
```

---

## Files Changed

### New files
| File | Purpose |
|---|---|
| `backend/services/data.py` | OptionsProvider abstraction + YFinance/Tradier implementations |
| `backend/services/bull_ml.py` | Sprint 2: logistic regression + retraining logic |

### Modified files
| File | Change |
|---|---|
| `backend/services/bull.py` | Full rewrite: channel detection, RSI slope, deterministic scoring, setup brief |
| `backend/models.py` | Add `PaperBullTrade` model |
| `backend/main.py` | Add `paper_bull_trades` lifespan migration + expiry resolution scheduler job |
| `backend/routers/bull.py` | Add auto-logging after scan, add `/kpis` and `/paper-trades` endpoints |
| `backend/services/claude.py` | Add `generate_setup_brief()` |
| `frontend/src/pages/Bull.jsx` | Full rewrite: ranked table, expandable rows, collapsed KPI strip |
| `frontend/src/pages/Progress.jsx` | Add collapsed Bull Performance section |
| `frontend/src/api.js` | Add `api.bull.kpis()`, `api.bull.paperTrades()` |
| `requirements.txt` | Add `numpy`, `scikit-learn` (Sprint 2: `xgboost`) |

---

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `TRADIER_API_KEY` | Swap yfinance options for Tradier — add after POC | No |
| `IBKR_CLIENT_PORTAL_URL` | IBKR Client Portal base URL for future provider | No |

---

## Out of Scope

- TradingView Pine Script webhook integration (future, requires Pro+ plan coordination)
- OptionStrat integration (no public API)
- Real-money auto-execution (this is a recommendation + paper tracking system only)
- Bear call spread screening (bull put is the priority; same engine applies after POC)
- Portfolio-level position sizing across multiple simultaneous setups

---

## Success Criteria for POC

The POC is considered successful (worth paying for a data subscription) if after 4–6 weeks of auto-logging:

1. **Score is predictive**: candidates with score ≥ 70 win at a meaningfully higher rate than score < 70
2. **Setup quality is credible**: when you manually review the top 3 candidates each day, at least 2 of 3 are setups you'd genuinely consider trading
3. **Win rate ≥ 60%** on auto-logged paper trades (consistent with bull put spread expectancy at ATM strikes)
4. **System identifies setups you missed**: at least once per week the screener surfaces a name you wouldn't have found manually

---

## Implementation Plan

Three sequential plans:

- **Plan 1 — Backend Core**: `data.py` (OptionsProvider) + `bull.py` rewrite (channel, RSI slope, deterministic scoring) + `generate_setup_brief()` + `PaperBullTrade` model + migrations + auto-logging + KPI endpoints
- **Plan 2 — Frontend**: `Bull.jsx` rewrite (ranked table, expandable rows, collapsed KPI strip) + `Progress.jsx` additions + `api.js` additions + frontend build
- **Plan 3 — Sprint 2 ML**: `bull_ml.py` (logistic regression, retraining job, ML confidence score integration) — execute after 50 paper trades collected
