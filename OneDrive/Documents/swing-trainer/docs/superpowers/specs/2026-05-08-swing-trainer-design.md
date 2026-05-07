# SwingTrainer v2 — Design Spec
**Date:** 2026-05-08  
**Project:** `OneDrive/Documents/swing-trainer/` (new project, replaces trader/)  
**Author:** Hernan Rosenblum

---

## 1. Purpose & Philosophy

SwingTrainer is a swing trading training and management platform. It is designed for personal use first (Hernan) but architected to support multiple users, each with their own profile, skill configuration, trade history, playbook, and training curriculum.

**Core philosophy: Train to Trade.** Training drives; journaling validates. The app is not a passive dashboard — it tells you what to practice, assigns targeted drills based on your actual weak spots, and detects patterns in your real trades to adapt your training automatically.

**Hernan's context at design time:**
- Currently trading small real money, testing edge
- Active skill areas: Entry Timing, Chart Reading, Risk & Sizing, Setup Selection
- Time budget: 30–45 min/day
- Wants a guided daily flow with optional depth, not a tab-browser

**Multi-user intent:** Future users onboard with their own skill selection and customizations. All data is user-scoped. No shared data between users.

---

## 2. Architecture & Tech Stack

### New Project
Clean slate at `OneDrive/Documents/swing-trainer/`. Nothing carried over from the existing `trader/` monolith.

### Frontend
- **React 18 + Vite** — component-based architecture, not a single-file monolith
- No external UI libraries — custom components only
- 5-tab sidebar navigation: Home, Train, Journal, Watchlist, Progress

### Backend
- **FastAPI (Python)** — replaces Flask; async, cleaner routing, auto-docs
- Serves chart data, proxies all Claude API calls, owns all data persistence
- Port: 7432 (consistent with existing tooling)

### Database
- **SQLite via SQLAlchemy** — replaces localStorage entirely
- Single `swing-trainer.db` file, local only
- All tables are user-scoped via `user_id` foreign key
- Tables: users, trades, checklist_logs, skill_scores, drill_results, module_progress, playbook_rules, watchlist, ai_patterns, cached_content

### AI
- **Claude API (claude-sonnet-4-6)** — called from backend only; no API key in browser
- Used for: drill feedback, auto-debrief, pattern detection, module content generation, setup analysis
- Content (module theory, quizzes) generated on demand and cached in DB

### Chart Data
- **yfinance** — free, no API key, sufficient for daily/weekly swing data
- Supports: OHLCV + EMA20, EMA50, SMA200, RSI, MACD, Bollinger Bands, ATR, VWAP, Volume MA, Stochastic

### Removed from v1
- Discord bot — out of scope for v2, focus on personal training loop
- Browser localStorage — replaced by SQLite
- Direct browser-side Claude API calls — moved to backend proxy

---

## 3. User Onboarding

New users go through a one-time setup flow before reaching the main app:

1. **Name** — display name only; no email/password required for local use
2. **Trading stage** — Still learning / Small real money / Active trader (sets starting level estimate)
3. **Skill selection** — presented with all 6 areas; user picks 2–6 to track (can change later in Settings)
4. **Time budget** — 15–20 min / 30–45 min / 1 hour+ (adjusts daily drill count: 1 / 2 / 3 drills per day)
5. **Playbook seed** — prompted to add at least one setup type with one must-have rule before starting (ensures the journal is usable from day one)

Multiple users on one machine switch via a user picker on the login screen. No passwords — this is a local personal tool.

---

## 4. Navigation Structure

```
Sidebar (always visible)
├── 🏠 Home          — daily session hub
├── 🎯 Train         — drills + learning modules
├── 📓 Journal
│   ├── Log Trade
│   ├── Trade History
│   └── 📋 My Playbook
├── 👁️ Watchlist     — setup scanning
└── 📈 Progress      — skill scores, patterns, levels
```

---

## 4. Home Screen

The home screen is the daily operating system. It is time-aware: the greeting and primary action reflect pre-market, market hours, or post-market context.

### Components
1. **Topbar** — greeting with user name, current time phase, and Level badge (e.g. "Level 3 · Developing Edge")
2. **Today's Training Session card** — the dominant card; shows today's 2–3 assigned drills with completion state, time estimates, and a "Start" button pointing at the next incomplete drill
3. **Skill Progress card** — 4 skill bars (Chart Reading, Entry Timing, Risk & Sizing, Setup Selection) with current scores out of 100
4. **Open Positions card** — live open trades with unrealised P&L and current R; direct link to close + debrief
5. **Training Streak** — days-of-week strip showing current streak count
6. **This Week's Edge** — trades taken, win rate, avg R, plan adherence for the current week

### Behaviour
- "Start [Drill Name]" button on the session card launches the drill directly (no navigation required)
- Open position P&L is computed from last-fetched price (yfinance, cached 15 min)
- Time phase detection: pre-market = before 9:30 AM ET, market = 9:30–4:00 PM ET, post-market = after 4:00 PM ET

---

## 5. Curriculum System (Train Tab)

### Skill Scoring

Six skill areas are available. Each user selects which ones to track during onboarding (minimum 2, maximum 6). Scores run 0–100 per active skill.

**The six areas:**
| Skill | Description |
|-------|-------------|
| **Chart Reading** | Identifying key levels, trend structure, setup validity |
| **Entry Timing** | Precision and confirmation of entries |
| **Risk & Sizing** | Position sizing consistency, stop adherence |
| **Setup Selection** | Selectivity, avoiding low-quality or out-of-edge setups |
| **Trade Management** | Holding through noise, not exiting winners early, letting losers run to stop |
| **Emotional Discipline** | FOMO control, no revenge trading, executing without hesitation |

Each skill area has its own dedicated drill types, module content, and journal pattern detection logic. The overall skill score and level are computed from the user's active skills only.

Score inputs:
- **Drill performance** (primary, 70% weight) — accuracy on completed drills
- **Journal patterns** (secondary, 30% weight) — plan adherence, stop discipline, R-multiple consistency from real trades

### Daily Drill Assignment
- 2 drills per day assigned automatically — user never chooses
- Assignment algorithm: weighted toward lowest-scoring skill; rotates drill types for variety
- Drills unlock more complex variants as skill scores rise

### Drill Types (five)
1. **Chart Entry** — real historical chart (symbol hidden), user selects entry approach from 3 options; scored on precision and reasoning; immediate feedback explaining the model answer
2. **Setup Validity** — 8 charts shown sequentially; user rates each Valid / Marginal / No-Trade; compared to model answers with explanations
3. **Risk Calculator** — given account size, risk %, entry, and stop: calculate correct share count; randomised parameters each time
4. **Scan Sprint** — 10 tickers drawn from the user's Watchlist (padded with random S&P 500 stocks if Watchlist has fewer than 10); 60 seconds per ticker; user marks each "has a setup" or "no setup today"; uses live yfinance data
5. **Trade Autopsy** — given a closed trade from the user's journal, identify the key decision that helped or hurt; surfaces after 10+ trades are logged

### Exercise Bank
- Chart Entry & Setup Validity: generated dynamically from yfinance historical data (symbol + date randomised); effectively unlimited, never repeats
- Risk Calculator: fully parameterised, unlimited variants
- Scan Sprint: always live data, always fresh
- Trade Autopsy: sourced from user's own journal; grows over time

### Levels
| Level | Name | Score Range |
|-------|------|-------------|
| 1 | Beginner | 0–24 avg |
| 2 | Building Edge | 25–44 avg |
| 3 | Developing Edge | 45–64 avg |
| 4 | Consistent Trader | 65–84 avg |
| 5 | Skilled Trader | 85–100 avg |

Score = average across all 4 skill areas. Higher levels unlock advanced drill variants and module content.

---

## 6. Learning Modules (Train Tab → Study)

### Structure
A library of 15–20 modules organised by skill area. The curriculum assigns 1–2 modules per week based on the user's lowest skill scores. The user can also browse and study ahead.

Each module: **Theory** (Claude-generated, ~300 words, cached in DB) → **Exercise** (interactive chart drill) → **Quiz** (3 Claude-generated questions, cached)

### Module States
- **Locked** — requires minimum skill score or level to unlock
- **Assigned** — curriculum has queued this module; appears on Home session card
- **In Progress** — started but not completed
- **Completed** — theory read + quiz passed (≥ 2/3 questions correct); score recorded

### Initial Module List (by skill area)
**Chart Reading:** Support & Resistance Zones, Trend Structure & HH/HL, Candlestick Patterns, Volume Interpretation  
**Entry Timing:** Breakout Entry Mechanics, Pullback Entry Timing, Confirmation vs Anticipation  
**Risk & Sizing:** Position Sizing from Risk %, Structural Stop Placement, Trailing Stops  
**Setup Selection:** Defining Your Edge, High-Quality vs Low-Quality Setups, Market Context Filters  
**Trade Management:** Holding Through Pullbacks, Scaling Out at Targets, When to Move Stop to Breakeven  
**Emotional Discipline:** Pre-Trade State Check, Recognising FOMO, Post-Loss Reset Protocol  
**Advanced (L4+):** Multi-Timeframe Analysis, Supply & Demand Zones, Managing Partial Positions

Only modules for a user's active skill areas are visible. Locked modules show the unlock condition.

### Content Generation
Module theory and quiz questions are generated by Claude on first access and cached in the DB. They are not static files. The AI is prompted with the user's skill level and recent drill mistakes to make content contextually relevant.

---

## 7. Journal System

### Trade Log Form
Simplified from v1. Fields:
- Symbol, Date, Direction (Long/Short)
- Setup Type (dropdown — must match a Playbook setup)
- Practice toggle (boolean) — marks the trade as a practice/paper trade; excluded from skill score calculations but visible in Trade History
- Entry $, Stop $, Target $ → auto-calculates: Risk/share, Planned R:R, Shares at 1% risk
- Pre-trade note: "Why is this trade valid?" (1–2 sentences, free text)
- Playbook checklist (auto-loaded from Playbook for the selected setup type)

### Playbook Checklist in the Log
When a setup type is selected, the rules from the user's Playbook for that setup load inline. Must-have rules that are unchecked block the "Log Trade" button. Should-have and context rules are visible but non-blocking. Checklist completion score (%) is displayed and stored with the trade.

### Trade States
- **Open** — position active; P&L updated from yfinance
- **Closed** — exit price logged; triggers auto-debrief

### Auto-Debrief (on trade close)
When a trade is closed, the app immediately generates a Claude debrief covering:
- Was the plan followed? (compared to pre-trade note)
- Entry quality relative to Playbook rules
- Risk management (was stop structural? was it honoured?)
- One pattern observation (links to recurring themes if present)
- Which skill area the trade most reflects — adjusts that skill's weighting for the next drill assignment

The debrief is stored in the DB and visible in Trade History.

### Pattern Detection
After every 5 new closed trades, Claude re-analyses the full journal and updates the AI-detected patterns list (visible in Progress tab). Patterns cover: entry timing habits, stop adherence, setup quality trends, volume filter compliance, rule-skipping frequency.

---

## 8. Playbook (Journal → My Playbook)

The Playbook is the user's personal rulebook. It defines entry rules per setup type, which become the checklist in the trade log form.

### Setup Types
User-defined. Default starters: Breakout, Pullback, Reversal, Gap & Go. User can add custom types.

### Rule Tiers
| Tier | Label | Behaviour |
|------|-------|-----------|
| Must-Have | 🔴 | Unchecked = cannot log the trade |
| Should-Have | 🟡 | Unchecked = warning shown, trade can still be logged |
| Context Note | 🔵 | Reminder only, no scoring impact |

### Rule Builder
- Drag-and-drop reordering within each tier
- Free-text rule entry — any indicator, price action rule, or thumb rule the user defines
- Rules are plain English (e.g. "EMA 20 trending up on daily", "Volume ≥ 1.5× 20-day avg")
- Rule skipping frequency tracked and surfaced in Progress → AI Patterns

---

## 9. Watchlist Tab

- User-managed list of stocks being monitored for setups
- Per-stock: current price (yfinance, 15-min cache), daily change %, OHLC, volume vs average
- Notes field per ticker for setup observations
- Chart launcher → embedded candlestick chart with indicator toggles (same indicators as v1 backend)
- "Add to Journal" shortcut pre-fills the trade log form with symbol and date

---

## 10. Progress Tab

### Stat Tiles (top row)
Overall Skill Score, Win Rate (last 30 trades), Avg R per trade, Plan Adherence — each with month-over-month delta.

### Skill Score Section
- 4 skill bars with current score, previous month score, and delta
- Level progression bar (L1→L5) with current position and points to next level

### AI-Detected Patterns
Claude-generated list of behavioural patterns from the journal (updated every 5 trades). Each pattern shows: description, supporting data, and what the app is doing about it (e.g. "Entry Timing drill priority increased"). Colour-coded: 🔴 problem, 🟡 watch, 🟢 strength.

### Module Tracker
Grid of all modules with states: Completed (score shown), In Progress, Assigned, Locked (unlock condition shown).

### Trade History
Sortable table of all logged trades: Symbol, Date, Setup, Direction, Entry, Exit, P&L, R-multiple, Checklist score, Debrief link.

---

## 11. Data Model (SQLite)

```
users           — id, name, trading_stage, time_budget, active_skills (json list), created_at
trades          — id, user_id, symbol, date, direction, setup_type, entry, stop, target, exit, shares, status, practice, pre_note, debrief, checklist_score, pnl, r_multiple, created_at
checklist_logs  — id, user_id, trade_id, rule_id, checked, tier
playbook_rules  — id, user_id, setup_type, text, tier, position, active
watchlist       — id, user_id, symbol, exchange, notes, added_at
skill_scores    — id, user_id, skill, score, updated_at
drill_results   — id, user_id, drill_type, skill, score, date, detail_json
module_progress — id, user_id, module_slug, status, quiz_score, completed_at
ai_patterns     — id, user_id, pattern_text, severity, detected_at, trade_range
cached_content  — id, key, content, generated_at  (shared across users; keyed by module slug + level)
```

---

## 12. AI Integration Points

| Feature | Model | Trigger | Output |
|--------|-------|---------|--------|
| Drill feedback | claude-sonnet-4-6 | After each drill question answered | 2–3 sentence explanation of model answer |
| Auto-debrief | claude-sonnet-4-6 | On trade close | Structured debrief (plan, entry, risk, pattern) |
| Pattern detection | claude-sonnet-4-6 | Every 5 closed trades | Updated pattern list |
| Module theory | claude-sonnet-4-6 | First module access | ~300 word lesson (cached) |
| Module quiz | claude-sonnet-4-6 | First quiz access | 3 MCQ questions (cached) |
| Setup analysis | claude-sonnet-4-6 | User requests from Watchlist tab | Entry, stop, target, R:R assessment |

All Claude calls go through the FastAPI backend. The frontend never calls Anthropic directly.

---

## 13. Out of Scope (v2)

- Discord bot
- Community/social features
- Mobile app
- Multi-user support
- Paper trading simulator (trades are real or explicitly marked "practice")
- Backtesting engine
- Automated trade execution

---

## 14. Success Criteria

The platform is working when:
1. Hernan opens it each morning and knows exactly what to do without deciding
2. Drill scores in the weakest skill areas are trending up month over month
3. Journal patterns detected by AI match what Hernan observes in his own trading
4. Plan adherence (checklist score) is above 80% consistently
5. The Playbook rules feel like his actual trading rules, not generic boilerplate
