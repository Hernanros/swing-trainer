---
phase: 07-options-trading-module
plan: "03"
subsystem: frontend
tags:
  - options
  - advisory
  - state-machine
  - TradeDrawer
  - ui
dependency_graph:
  requires:
    - 07-02
  provides:
    - Advisory panel UI in TradeDrawer with 4-state machine (idle/loading/result/error)
    - Reset-on-edit behavior: any form field change clears advisory state to idle
    - Pre-trade advisory passed through to open_trade payload as pre_trade_advisory
  affects:
    - frontend/src/components/TradeDrawer.jsx
    - frontend/src/api.js
    - frontend/src/styles/globals.css
tech_stack:
  added: []
  patterns:
    - 4-state machine for async UI (idle | loading | result | error) managed with useState
    - advisoryReady guard: button disabled until all 5 spread fields are filled
    - Reset-on-edit: handleFieldChange resets advisoryState to idle and advisoryText to '' on any input change
    - Spinner via @keyframes spin in globals.css (no new dependency)
    - Graceful fallback string displayed as result state when ANTHROPIC_API_KEY absent
key_files:
  created: []
  modified:
    - frontend/src/components/TradeDrawer.jsx
    - frontend/src/api.js
    - frontend/src/styles/globals.css
decisions:
  - Reset advisory on field edit so stale advisory is never submitted with mismatched strike/expiry values
  - Button label flips to "Refresh Advisory" in result state (not a second button) to keep panel compact
  - Loading spinner uses a 16x16 span with @keyframes spin rather than a library component — no new dependency
  - pre_trade_advisory passed as advisoryText || null to open_trade so empty string never stored
metrics:
  duration: "~25 minutes"
  completed: "2026-06-14"
  tasks_completed: 1
  files_modified: 3
---

# Phase 7 Plan 03: Advisory Panel UI Summary

**One-liner:** 4-state advisory panel (idle/loading/result/error) in TradeDrawer with reset-on-edit, spinner, fallback display, and pre_trade_advisory passthrough to open_trade.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add advisory panel to TradeDrawer with 4 interaction states | f7a7176 | frontend/src/components/TradeDrawer.jsx, frontend/src/api.js, frontend/src/styles/globals.css |

## What Was Built

**3 files modified in a single atomic commit (`f7a7176`):**

**`frontend/src/components/TradeDrawer.jsx`** — main advisory panel logic:
- Line 35: `advisoryState` state variable initialized to `'idle'`; comment documents all 4 state values: `'idle' | 'loading' | 'result' | 'error'`
- Line 36: `advisoryText` state variable initialized to `''`
- Lines 131-132: `setAdvisoryState('idle')` + `setAdvisoryText('')` in `handleFieldChange` — reset-on-edit behavior; any form field change clears advisory state
- Line 147: `advisoryReady` derived boolean — true only when all 5 required spread fields are non-empty (`option_spread_type`, `option_expiry`, `option_long_strike > 0`, `option_short_strike > 0`, `entry_price > 0`)
- Lines 149-167: `handleGetAdvisory` async handler — sets loading, calls `api.trades.spreadAdvisory(...)`, sets result text + state on success, sets error state on catch
- Line 226: `pre_trade_advisory: advisoryText || null` in `open_trade` payload — passes advisory through to backend (null if empty, never empty string)
- Lines 468-495: Advisory panel JSX block:
  - "AI ADVISORY" label (line 468)
  - "Get Advisory" / "Refresh Advisory" button (hidden during loading, label flips in result state) at lines 469-479
  - Loading spinner span at lines 481-485
  - Result paragraph (`role="status"`) at lines 487-489
  - Error message at lines 490-494

**`frontend/src/api.js`**:
- Line 59: `spreadAdvisory: (body) => request('POST', '/trades/spread-advisory', body)` — wires frontend to the 07-02 backend endpoint

**`frontend/src/styles/globals.css`**:
- Line 417: `@keyframes spin { to { transform: rotate(360deg); } }` — added to support loading spinner; no new CSS dependency

## Advisory Panel Insertion Points in TradeDrawer.jsx

| Symbol / Block | Line(s) | Purpose |
|---|---|---|
| `advisoryState` useState | 35 | State machine variable, initial `'idle'` |
| `advisoryText` useState | 36 | Advisory response text variable |
| Reset-on-edit (setAdvisoryState/Text) | 131-132 | Any field change resets advisory to idle |
| `advisoryReady` derived bool | 147 | Gate: all 5 spread fields must be filled |
| `handleGetAdvisory` async handler | 149-167 | Calls API, manages state transitions |
| `pre_trade_advisory` in open_trade | 226 | Passes advisory text to backend on submit |
| AI ADVISORY label (JSX) | 468 | Panel header |
| Button (hidden during loading) | 469-479 | Get/Refresh trigger |
| Loading spinner | 481-485 | Visible only in `'loading'` state |
| Result paragraph | 487-489 | Visible only in `'result'` state |
| Error message | 490-494 | Visible only in `'error'` state |

## @keyframes spin Confirmation

Added at `frontend/src/styles/globals.css` line 417:
```css
@keyframes spin { to { transform: rotate(360deg); } }
```
Used by the loading spinner span (`animation: spin 0.8s linear infinite`). No CSS library added.

## Human Checkpoint Results

All 8 interaction states verified by human reviewer and **approved**.

| State | Expected behavior | Result |
|---|---|---|
| Idle (spread fields empty) | Button shows "Get Advisory", disabled (opacity 0.4, not-allowed cursor) | Approved |
| Idle (spread fields filled) | Button enabled, `advisoryReady = true` | Approved |
| Loading | Spinner visible, button hidden | Approved |
| Result | Advisory text shown in result paragraph, button shows "Refresh Advisory" | Approved |
| Fallback (no API key) | `[Advisory unavailable — set ANTHROPIC_API_KEY to enable]` shown in result paragraph | Approved (expected without API key in dev) |
| Error | Error message shown below button | Approved |
| Reset-on-edit | Editing any field after result clears panel back to idle | Approved |
| Submit passthrough + equity regression | `pre_trade_advisory` included in open_trade payload for spreads; equity trade flow unaffected | Approved |

**Fallback string confirmed in result state:** `[Advisory unavailable — set ANTHROPIC_API_KEY to enable]`
This is expected in development without `ANTHROPIC_API_KEY` set. The backend service returns this string rather than calling the Anthropic API, and the frontend displays it in the `'result'` state (not the `'error'` state).

## Acceptance Checks (Grep Counts)

| Check | Expected | Actual |
|---|---|---|
| `advisoryState\|advisoryText\|advisoryReady\|handleGetAdvisory` in TradeDrawer.jsx | ≥1 | 15 |
| `spreadAdvisory` in api.js | 1 | 1 |
| `@keyframes spin` in globals.css | 1 | 1 |

All acceptance checks pass.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The fallback string `[Advisory unavailable — set ANTHROPIC_API_KEY to enable]` is intentional behavior from the backend service (07-02), not a frontend stub. All 4 state branches are wired to real data or real error conditions.

## Threat Surface Scan

No new network endpoints added in this plan. The frontend calls `POST /api/trades/spread-advisory` (added in 07-02, already threat-modeled). No new auth paths, file access patterns, or schema changes introduced.

No new threat flags.

## Self-Check: PASSED

- `frontend/src/components/TradeDrawer.jsx`: `advisoryState`, `advisoryText`, `advisoryReady`, `handleGetAdvisory` all present (grep count: 15)
- `frontend/src/api.js`: `spreadAdvisory` present at line 59 (grep count: 1)
- `frontend/src/styles/globals.css`: `@keyframes spin` present at line 417 (grep count: 1)
- Commit `f7a7176` exists in git log (verified)
- Human checkpoint: all 8 states approved

---
*Phase: 07-options-trading-module*
*Completed: 2026-06-14*
