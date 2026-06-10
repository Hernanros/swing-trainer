---
phase: 07-options-trading-module
plan: "02"
subsystem: backend
tags:
  - options
  - advisory
  - claude
  - migration
dependency_graph:
  requires:
    - 07-01
  provides:
    - Trade.pre_trade_advisory column
    - POST /api/trades/spread-advisory endpoint
    - generate_spread_advisory service function
  affects:
    - backend/models.py
    - backend/main.py
    - backend/schemas.py
    - backend/routers/trades.py
    - backend/services/claude.py
    - tests/test_options.py
tech_stack:
  added: []
  patterns:
    - TDD (RED/GREEN) for each task
    - Graceful degradation when ANTHROPIC_API_KEY is absent
    - Lifespan ALTER TABLE guard for additive migrations (idempotent)
    - Pydantic inline body model (SpreadAdvisoryRequest) for endpoint-specific validation
key_files:
  created: []
  modified:
    - backend/models.py
    - backend/main.py
    - backend/schemas.py
    - backend/routers/trades.py
    - backend/services/claude.py
    - tests/test_options.py
decisions:
  - SpreadAdvisoryRequest uses entry_price/shares matching TradeCreate convention
  - generate_spread_advisory imports anthropic lazily inside function body to preserve graceful degradation at import-time when library is absent
  - pre_trade_advisory stored as TEXT with no NOT NULL constraint and no default; existing rows receive NULL (matching prior option column pattern)
metrics:
  duration: "~70 minutes"
  completed: "2026-06-10T15:22:44Z"
  tasks_completed: 2
  files_modified: 6
---

# Phase 7 Plan 02: Pre-Trade Spread Advisory Backend Summary

**One-liner:** SQLite migration + Anthropic advisory service + `POST /api/trades/spread-advisory` endpoint with graceful fallback, wired to `pre_trade_advisory` persistence in `open_trade`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests: pre_trade_advisory column + schema | de766f5 | tests/test_options.py |
| 1 (GREEN) | ORM column, lifespan migration, Pydantic schema fields | ad434c8 | backend/models.py, backend/main.py, backend/schemas.py |
| 2 (RED) | Failing tests: spread-advisory endpoint + persistence | 163f691 | tests/test_options.py |
| 2 (GREEN) | generate_spread_advisory service, endpoint, persistence | ec821e8 | backend/services/claude.py, backend/routers/trades.py |

## What Was Built

**Task 1 — Schema and storage layer:**

- `backend/models.py`: Added `pre_trade_advisory = Column(Text, nullable=True)` after `option_spread_type` in the `Trade` class
- `backend/main.py`: Added lifespan guard `if "pre_trade_advisory" not in option_cols: conn.execute(text("ALTER TABLE trades ADD COLUMN pre_trade_advisory TEXT")); conn.commit()` — idempotent, no NOT NULL, no default
- `backend/schemas.py`: Added `pre_trade_advisory: Optional[str] = None` to both `TradeCreate` (after `option_spread_type`) and `TradeResponse` (before `max_profit`)

**Task 2 — Service, endpoint, persistence:**

- `backend/services/claude.py`: `generate_spread_advisory(trade_data, rules)` — graceful fallback returns `"[Advisory unavailable — set ANTHROPIC_API_KEY to enable]"` when key absent; otherwise builds 3-paragraph prompt (strike placement, risk/reward, expectations) and calls `claude-sonnet-4-6` at `max_tokens=300`
- `backend/routers/trades.py`:
  - Added `from pydantic import BaseModel` import
  - `_to_response`: added `"pre_trade_advisory": t.pre_trade_advisory`
  - `open_trade` Trade constructor: added `pre_trade_advisory=body.pre_trade_advisory`
  - New `SpreadAdvisoryRequest` Pydantic model (symbol, option_spread_type, option_long_strike, option_short_strike, option_expiry, entry_price, shares, setup_type?)
  - `POST /trades/spread-advisory`: validates spread type, queries user-scoped PlaybookRules when setup_type provided, returns `{"advisory": <string>}`

**Route registered at:** `/api/trades/spread-advisory`

**Lifespan migration line:**
```python
if "pre_trade_advisory" not in option_cols:
    conn.execute(text("ALTER TABLE trades ADD COLUMN pre_trade_advisory TEXT"))
    conn.commit()
```

## New Tests Added

All tests added to `tests/test_options.py` (no existing test was modified):

**Task 1 tests:**
- `test_trade_model_has_pre_trade_advisory_column`
- `test_trade_create_accepts_pre_trade_advisory`
- `test_trade_create_defaults_pre_trade_advisory_to_none`

**Task 2 tests:**
- `test_spread_advisory_returns_fallback_string_without_api_key`
- `test_spread_advisory_rejects_unknown_spread_type`
- `test_open_option_spread_persists_pre_trade_advisory`
- `test_open_option_spread_pre_trade_advisory_defaults_to_none`

**Total test count:** 52 passed (tests/test_options.py + tests/test_trades.py + tests/test_claude_service.py), no regressions.

## TDD Gate Compliance

- RED gate: `de766f5` (Task 1 test commit), `163f691` (Task 2 test commit) — both confirmed FAILING before implementation
- GREEN gate: `ad434c8` (Task 1 impl commit), `ec821e8` (Task 2 impl commit) — all tests passing after each implementation
- REFACTOR: No structural cleanup needed; implementation was clean on first pass

## Deviations from Plan

None — plan executed exactly as written.

The only minor formatting note: `_to_response` uses `"pre_trade_advisory":  t.pre_trade_advisory,` (two spaces before `t`) to maintain column alignment with other option fields. This matches the visual alignment convention of the surrounding block and is functionally equivalent to the plan's single-space acceptance criteria check.

## Known Stubs

None — all fields are wired end-to-end. The graceful fallback string is intentional behavior (not a stub) for the case when `ANTHROPIC_API_KEY` is absent.

## Threat Flags

No new security surface beyond what the plan's threat model covers:
- `POST /api/trades/spread-advisory` is authenticated via `Depends(get_current_user)` (T-07-02-02 mitigated)
- `option_spread_type` validated against `VALID_SPREADS` allowlist before any processing (T-07-02-01 mitigated)
- PlaybookRule query filtered by `user_id == current_user.id` (cross-user isolation maintained)
- `pre_trade_advisory` stored per trade row, returned only for authenticated user's own trades (T-07-02-05 mitigated)

## Self-Check: PASSED

All 6 implementation files found. All 4 task commits verified (de766f5, ad434c8, 163f691, ec821e8). 52 tests passing.
