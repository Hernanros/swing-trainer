# Swing Trainer — Improvement Plan
_Generated from product-review audit. Stable baseline saved at branch `stable-v1`._

## Guiding principles
- Integrations over building components from scratch
- Every change must close a broken loop, not add a new island
- Training and real-world application are the priority — UI polish is not

---

## Phase 1 — Close the AI loop (no external services needed)
**Goal:** Make Tips, Ask, and Debrief actually know who the user is.

### 1A. User context function + prompt caching
**File:** `backend/services/claude.py`

Add `get_user_coaching_context(user, db)` that returns:
- Last 20 closed trades: symbol, setup_type, R-multiple, checklist_score, debrief
- Skill scores: all skills + score
- Weakest skill (lowest score)
- Curriculum completion % per skill group

Pass this as a **cached system prompt** (Anthropic prompt caching) to:
- `generate_daily_tip` — target the weakest skill, reference actual trade data
- `generate_ask_tip` — answer in context of the user's real patterns

Implementation: Use `anthropic.beta.prompt_caching` with `cache_control: {"type": "ephemeral"}` on the system block. Cache TTL is 5 min — sufficient for a single session.

### 1B. Daily tip targets weakest skill
**File:** `backend/routers/tips.py`

Change `generate_daily_tip` call: instead of picking a random skill, query `SkillScore` for the user's lowest-scoring skill and target that. If no scores yet, pick randomly as fallback.

### 1C. Auto-trigger AI debrief on trade close
**File:** `backend/routers/trades.py`

In `close_trade()`, after committing, call `generate_trade_debrief(trade)` immediately and save to `trade.ai_debrief`. Remove the separate `/ai-debrief` endpoint (or keep it for manual refresh). No more manual button click required.

---

## Phase 2 — Historical chart in journal (Polygon.io / yfinance)
**Goal:** When reviewing a past trade, show the actual chart for that symbol around the entry date.

### 2A. Backend: historical OHLC endpoint
**New file:** `backend/routers/market.py` (extend existing)

Add `GET /api/market/history/{symbol}?date=YYYY-MM-DD&days=60`

Use **yfinance** (free, already available via pip) to fetch 60 days of daily OHLC centered on the trade date. Return as `[{time, open, high, low, close}]` — same format as existing DrillChart data.

```python
import yfinance as yf
ticker = yf.Ticker(symbol)
hist = ticker.history(start=start_date, end=end_date)
```

### 2B. Frontend: chart in journal row expansion
**File:** `frontend/src/pages/Journal.jsx`

Make each journal row expandable (click to expand). In the expanded view:
- Show `DrillChart` component fed with the historical data from 2A
- Show trade markers: vertical line at entry date, horizontal lines at entry/stop/target/exit prices
- Show AI debrief text if it exists
- Show checklist score if it exists

This closes the most critical gap: drill on charts → trade → **review the actual chart**.

### 2C. Entry date stored as actual trade date
**Note:** `Trade.date` is currently set to `datetime.now()` at creation (`trades.py:78`). This means if you log a trade after the fact, the chart will be wrong. Consider adding a `trade_date` field to `TradeCreate` schema, defaulting to today, letting user override.

---

## Phase 3 — Earnings date on watchlist (Finnhub free tier)
**Goal:** Never blow up a trade by holding through earnings unknowingly.

### 3A. Backend: earnings date lookup
**File:** `backend/services/market.py`

Add `get_next_earnings(symbol)` using Finnhub free API:
```
GET https://finnhub.io/api/v1/calendar/earnings?symbol=AAPL&token=FREE_KEY
```
Returns next earnings date. Cache result in `CachedContent` table (key: `earnings:{symbol}`, TTL: 24h) — this table already exists and is currently unused.

### 3B. Frontend: earnings date in watchlist
**File:** `frontend/src/pages/Watchlist.jsx`

Add `EarningsCell` component next to `QuoteCell`. Shows:
- Days until earnings (e.g. "ER in 4d" in yellow, "ER tomorrow" in red)
- "ER passed" in muted if no upcoming date found

This is protective data. One glance tells the user whether it's safe to hold.

---

## Phase 4 — Activate AIPattern (nightly trade analysis)
**Goal:** Surface behavioral patterns across the user's trade history. This table has existed since day 1 with zero rows.

### 4A. Backend: pattern analysis endpoint
**New route:** `POST /api/progress/analyze-patterns`

Called manually (button on Progress page) or on a schedule. Takes last 30 closed trades, sends to Claude with a structured prompt:

```
Analyze these trades and identify 3-5 behavioral patterns.
For each pattern return: {pattern_text, severity: "problem"|"watch"|"strength"}
Focus on: exit discipline, stop placement consistency, setup win rates, checklist adherence correlation.
```

Writes results to `AIPattern` table, replacing any prior patterns for that user.

### 4B. Frontend: patterns on Home + Progress
**File:** `frontend/src/pages/Home.jsx` and `Progress.jsx`

Show `AIPattern` rows on Home dashboard (problems in red, watch in yellow, strengths in green). On Progress, show full pattern history with dates.

---

## Phase 5 — Fix broken connections (no new features, pure wiring)

### 5A. Practice trades excluded from stats
**File:** `backend/routers/progress.py`

In `get_stats()`, filter `practice=False` when computing win rate, avg R, total P&L. Add a separate `practice_trades` count for transparency.

### 5B. Checklist score visible in journal
**File:** `frontend/src/pages/Journal.jsx`

Add checklist score column to the journal table. Color-code: ≥80% green, 50-79% yellow, <50% red. One column, no new UI needed.

### 5C. Targeted drill recommendation on Home
**File:** `frontend/src/pages/Home.jsx`

Below the training session card, add one line: "Weakest skill: **Chart Reading** (42) — [Practice now →]". Reads from `SkillScore`, links to `/train` with that drill pre-selected. No new component needed — just a conditional render using existing skill data that's already loaded.

### 5D. detail_json on DrillResult — track wrong questions
**File:** `backend/routers/train.py` and `frontend/src/components/drills/QuizDrill.jsx`

When QuizDrill completes, send the per-question results (question index + correct/wrong) as `detail_json` to `POST /train/quiz/submit`. Store in `DrillResult.detail_json`. This enables future spaced repetition — you can't target weak questions without knowing which ones they are.

---

## Phase 6 — Adaptive training (spaced repetition)
**Goal:** Questions you consistently miss come back more often. Day 100 is harder than day 1.

**Approach:** Use the `detail_json` data from Phase 5D. When loading a quiz, weight question selection by inverse of recent accuracy per question. Track per-question accuracy in a new lightweight table or in a JSON blob on `UserSettings`.

Defer this until Phase 5D has at least 2 weeks of data.

---

## Build order and rationale

| Phase | Effort | Value | Why this order |
|---|---|---|---|
| 1 — AI context | 1-2 days | High | No external service, immediate improvement to existing features |
| 2 — Historical charts | 3-4 days | Very high | Closes the core training loop, uses free yfinance |
| 3 — Earnings dates | 1 day | High | Protective, free Finnhub tier, one endpoint |
| 4 — AIPattern | 2-3 days | High | Activates dead infrastructure, no new schema |
| 5 — Broken connections | 1-2 days | Medium | Fixes data quality issues, all internal |
| 6 — Adaptive training | 3-4 days | Medium | Requires Phase 5D data first |

**Do not build:** price alerts, brokerage import, TradingView embeds, social features. None of these close the gaps identified in the audit.

---

## Revert to stable baseline anytime
```bash
git checkout stable-v1
```
Or to return to master after:
```bash
git checkout master
```

---

## Phase 7 — Options Trading Module
**Goal:** Extend the app to support the user's current strategy pivot toward bull put spreads, bear call spreads, and shorts — integrating options-specific drills, a spread builder with Claude advisory, and behavioral debrief for options trades.

**Design principle:** Follow the same loop as existing stock trades — Train → Build → Journal → AI Debrief. Don't create a separate silo. Options are a trade type, not a separate app.

### 7A. Options drill bank
**Files:** `frontend/src/data/drillQuestions.js`, `frontend/src/data/drillChartData.js`

Add a new drill category: `options_setups`. Questions should cover:
- Bull put spread: setup criteria, when to enter, max gain/loss calculation, breakeven, when to close
- Bear call spread: same structure for bearish credit spreads
- Short stock/synthetic: entry criteria, risk management, covering logic
- Strike selection principles: how far OTM, how to balance premium vs. probability
- IV rank: when high IV favors credit spreads vs. debit

Use the existing AI drill endpoint (`POST /api/train/ai-drill`) to generate on-demand options questions referencing actual spread parameters from 7B trades.

### 7B. Spread builder with Claude pre-trade advisory
**New file:** `frontend/src/components/SpreadBuilder.jsx`
**New route:** `POST /api/trades/spread-advisory`

Spread builder form captures (see `.planning/requirements/spread-builder-data-model.md` for full spec):
- Underlying symbol, strategy type, short strike, long strike, expiry, premium collected/paid
- Derived display: max gain, max loss, breakeven, risk/reward ratio

On submit (before entering the trade), call Claude with:
```
User strategy: bull put spread on {symbol}
Short strike: {short_k}, Long strike: {long_k}, Expiry: {expiry}, Premium: {premium}
Max gain: {max_gain}, Max loss: {max_loss}, Breakeven: {breakeven}
User's playbook rules for this setup: {rules}

Evaluate: strike placement, risk/reward quality, IV context expectations.
Advise: what to expect, when to close (% of max profit target), key risk.
```

This advisory is saved to the trade record as `pre_trade_advisory`.

### 7C. Options journal entries
**Files:** `backend/schemas.py`, `backend/models.py`, `backend/routers/trades.py`

Extend the `Trade` model to support options:
- Add `trade_type` enum: `stock | bull_put_spread | bear_call_spread | short`
- Add nullable `spread_params` TEXT column (JSON): `{short_strike, long_strike, expiry, premium, contracts}`
- Derived fields computed at close: `max_gain`, `max_loss`, `breakeven` (store on close)
- Add `pre_trade_advisory` TEXT column (stores 7B Claude advisory)

Journal page: when `trade_type` is a spread, show spread-specific columns (short/long strike, expiry, premium) instead of entry/stop/target.

### 7D. Behavioral AI debrief for options
**File:** `backend/services/claude.py`

Extend `generate_trade_debrief()` to handle options context:
- For spreads: did the user exit at their % of max profit target? Did they hold to expiry? Did they adjust (roll, close one leg)?
- Compare `pre_trade_advisory` expectations vs. actual outcome
- Flag behavioral patterns: "You planned to close at 50% profit but held to expiry 3 of 4 times"

Same debrief UX as existing trades — no new UI needed.

### Build order

| Step | Task | Effort |
|---|---|---|
| 7A | Options drill questions (static bank, 20+ questions) | 1 day |
| 7B | Spread builder form + Claude advisory endpoint | 2 days |
| 7C | Trade model extension + options journal view | 2 days |
| 7D | Options-aware debrief | 1 day |

**Start with 7B — the spread builder.** It delivers immediate value (you're already trading these setups), informs what drill questions to write, and the trade model extension follows naturally from what the builder captures.
