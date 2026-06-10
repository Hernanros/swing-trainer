# Roadmap: Swing Trainer

## Overview

Swing trading education PWA. Phases 1–6 are complete. Phase 7 extends the app to support options credit spreads — bull put spreads, bear call spreads, and shorts — with integrated drills, a spread builder with Claude pre-trade advisory, and behavioral AI debrief.

## Phases

- [x] **Phase 1: AI Context Loop** - Give Tips, Ask, and Debrief user-specific context via prompt caching
- [x] **Phase 2: Historical Chart in Journal** - Show actual OHLC chart for past trades anchored to trade date
- [x] **Phase 3: Earnings Dates on Watchlist** - Display upcoming earnings dates via Finnhub to avoid holding through ER
- [x] **Phase 4: AI Pattern Analysis** - Surface behavioral patterns across trade history using Claude Haiku
- [x] **Phase 5: Fix Broken Connections** - Wire up dead infrastructure: practice trade exclusion, checklist score display, targeted drill recommendation, detail_json tracking
- [x] **Phase 6: Close Product Gaps** - Playbook checklist at trade close, per-setup analytics, watchlist→journal bridge, journal date fix, analysis badge
- [ ] **Phase 7: Options Trading Module** - Bull put spread drills, spread builder with Claude advisory, options journal entries, behavioral debrief

## Phase Details

### Phase 1: AI Context Loop

**Goal**: Make Tips, Ask, and Debrief know who the user is via prompt caching
**Status**: Complete
**Plans**: 3 plans

### Phase 2: Historical Chart in Journal

**Goal**: Show actual OHLC chart anchored to trade date in journal rows
**Status**: Complete
**Plans**: 3 plans

### Phase 3: Earnings Dates on Watchlist

**Goal**: Display upcoming earnings dates on watchlist to prevent ER surprises
**Status**: Complete
**Plans**: 2 plans

### Phase 4: AI Pattern Analysis

**Goal**: Surface 3–5 behavioral patterns from trade history using Claude Haiku
**Status**: Complete
**Plans**: 2 plans

### Phase 5: Fix Broken Connections

**Goal**: Wire up dead infrastructure and fix data quality issues
**Status**: Complete
**Plans**: 4 plans

### Phase 6: Close Product Gaps

**Goal**: Playbook checklist at close, per-setup analytics, watchlist→journal bridge
**Status**: Complete
**Plans**: 6 plans

### Phase 7: Options Trading Module

**Goal**: Extend the app to support the user's credit spread strategy — bull put spreads (primary), bear call spreads, and shorts — with integrated drills, a spread builder + Claude pre-trade advisory, options-aware journal, and behavioral debrief
**Depends on**: Phase 6
**Success Criteria** (what must be TRUE):

  1. User can log a bull put spread or bear call spread trade with strikes, expiry, and premium; max gain/loss/breakeven are computed and displayed
  2. Before opening a spread trade, Claude evaluates the strike placement, risk/reward, and what to expect — advisory is saved with the trade
  3. Drill questions exist for bull put spread, bear call spread, and short setup criteria; AI drill endpoint can generate options-specific questions
  4. Closing a spread trade triggers a behavioral debrief that compares plan vs. execution and references the pre-trade advisory
  5. Existing equity trade flow is unaffected

**Plans**: 4 plans

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Options drill bank: add `options_setups` to VALID_DRILL_KEYS and ship 20+ shuffled text-only questions weighted bull put > bear call > shorts

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-02-PLAN.md — Backend pre-trade advisory: `pre_trade_advisory` column + lifespan migration, `generate_spread_advisory` Claude service, `POST /api/trades/spread-advisory` endpoint, persistence on open

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 07-03-PLAN.md — Frontend advisory panel in TradeDrawer with 4 interaction states, `api.trades.spreadAdvisory`, `@keyframes spin`, and submit passthrough (human checkpoint)
- [ ] 07-04-PLAN.md — Advisory-aware debrief: refactor prompt build into `_build_debrief_prompt`, conditionally inject advisory text + comparison instruction for option_spread trades
