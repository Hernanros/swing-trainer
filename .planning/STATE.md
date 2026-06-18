---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
last_updated: "2026-06-16T11:48:04.922Z"
last_activity: 2026-06-14 -- Phase 7 Plan 04 (Advisory-Aware Debrief) completed
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 14
---

# Project State

## Project Reference

**Project:** Swing Trainer — swing trading education PWA
**Core value:** Train, plan, journal, and debrief swing + options trades in one app with AI coaching
**Current focus:** Phase 7 — Options Trading Module

## Current Position

Phase: 7 (Options Trading Module) — COMPLETE
Plan: 4 of 4
Status: Phase 7 complete
Last activity: 2026-06-14 -- Phase 7 Plan 04 (Advisory-Aware Debrief) completed

Progress: ███████████ 100%

## Decisions

- FastAPI + SQLite backend; React/Vite frontend; deployed to Railway
- Schema migrations run in lifespan via raw ALTER TABLE checks — no migration tool
- Claude Sonnet for debriefs, Claude Haiku for tips/patterns/analysis
- Prompt caching on coaching context system block
- Trade types: `equity` | `option_spread` (trade_type column)
- Option spread fields: option_spread_type, option_long_strike, option_short_strike, option_expiry, entry (= premium)
- Credit spreads: bull_put, bear_call. Debit spreads: bull_call, bear_put
- lightweight-charts v5: use addSeries(CandlestickSeries) NOT addCandlestickSeries()
- DEV_BYPASS_AUTH=true skips all auth and returns first DB user
- _build_debrief_prompt extracted as module-level helper for testability; pre_trade_advisory wired only in option_spread branch using getattr for backward compat
