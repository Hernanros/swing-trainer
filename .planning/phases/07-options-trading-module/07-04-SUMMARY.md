---
phase: 07-options-trading-module
plan: "04"
subsystem: backend
tags:
  - options
  - advisory
  - claude
  - tdd
  - debrief
dependency_graph:
  requires:
    - 07-02
  provides:
    - _build_debrief_prompt helper (testable prompt builder)
    - pre_trade_advisory in option_spread debrief prompt
    - plan-vs-execution advisory comparison hook
  affects:
    - backend/services/claude.py
    - tests/test_claude_service.py
tech_stack:
  added: []
  patterns:
    - TDD (RED/GREEN) — test-first for extracted helper
    - Extract helper to make prompt logic unit-testable
    - getattr-based safe attribute access for backward compatibility
key_files:
  created: []
  modified:
    - backend/services/claude.py
    - tests/test_claude_service.py
decisions:
  - Extracted _build_debrief_prompt as module-level helper directly above generate_trade_debrief (line 73) so it is importable from tests without triggering the API key guard
  - Used getattr(trade, 'pre_trade_advisory', None) for all truthiness checks to safely handle trades from older code paths that may lack the attribute
  - Advisory hook added only in the option_spread branch; equity branch is intentionally unaffected
  - generate_trade_debrief retains its public signature unchanged; API key guard remains first statement
metrics:
  duration: "~2 minutes"
  completed: "2026-06-14T08:24:00Z"
  tasks_completed: 1
  files_modified: 2
---

# Phase 7 Plan 04: Advisory-Aware Debrief Summary

**One-liner:** Extracted `_build_debrief_prompt` helper from `generate_trade_debrief` and wired `pre_trade_advisory` into the option_spread debrief prompt (trade_block + paragraph comparison instruction).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for _build_debrief_prompt | c46afc8 | tests/test_claude_service.py |
| 1 (GREEN) | Extract helper, wire pre_trade_advisory | 7b1924f | backend/services/claude.py |

## What Was Built

**`backend/services/claude.py`:**

- `_build_debrief_prompt` inserted at **line 73**, directly above `generate_trade_debrief`
  - Signature: `def _build_debrief_prompt(trade, rule_detail=None, coaching_context="", playbook_rules=None) -> str`
  - Contains all prompt-construction logic previously inline in `generate_trade_debrief` (lines 79-151 of original)
  - **Line 107-108:** In the option_spread branch, after `trade_block` is assembled:
    ```python
    if getattr(trade, 'pre_trade_advisory', None):
        trade_block += f"\n- Pre-trade advisory: {trade.pre_trade_advisory}"
    ```
  - **Lines 116-117:** In the option_spread branch, after `paragraphs` is assigned:
    ```python
    if getattr(trade, 'pre_trade_advisory', None):
        paragraphs += "\n\nPre-trade advisory given:\n" + trade.pre_trade_advisory + "\n\nIn paragraph 1, briefly compare whether the outcome matched the advisory's expectations."
    ```
  - Equity branch unchanged — no advisory hooks
  - Returns assembled `prompt` string

- `generate_trade_debrief` (now at **line 146**):
  - API key guard remains FIRST statement (unchanged)
  - Delegates to `_build_debrief_prompt` at **line 160**: `prompt = _build_debrief_prompt(trade, rule_detail, coaching_context, playbook_rules)`
  - Anthropic call and return unchanged

**Acceptance grep counts:**
- `def _build_debrief_prompt` in claude.py: **1**
- `pre_trade_advisory` in claude.py: **4** (>= 3 required)
- `compare whether the outcome matched` in claude.py: **1**
- `pre_trade_advisory` in test_claude_service.py: **5** (>= 4 required)

## New Tests Added

All 4 tests added to `tests/test_claude_service.py` (no existing tests modified):

- `test_debrief_prompt_includes_pre_trade_advisory_for_option_spread` — bull_put trade with advisory; asserts advisory text and "compare whether the outcome matched" both appear in prompt
- `test_debrief_prompt_omits_advisory_when_none` — option_spread with `pre_trade_advisory=None`; asserts "Pre-trade advisory" and "compare whether the outcome matched" not in prompt
- `test_debrief_prompt_omits_advisory_when_empty_string` — option_spread with `pre_trade_advisory=""`; same negative assertions
- `test_debrief_prompt_omits_advisory_for_equity_trade` — equity trade with advisory text; asserts advisory text does NOT appear in prompt

## Pytest Summary

```
56 passed, 1 warning in 1.21s
```
(tests/test_claude_service.py + tests/test_options.py + tests/test_trades.py — no regressions)

## TDD Gate Compliance

- RED gate: `c46afc8` — 4 tests added, all failing with `ImportError: cannot import name '_build_debrief_prompt'`
- GREEN gate: `7b1924f` — all 13 test_claude_service.py tests passing, 56 total passing

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

No new security surface introduced. `_build_debrief_prompt` is a pure string-building function with no network, DB, or auth surface.

## Self-Check: PASSED

- `backend/services/claude.py` confirmed modified (grep counts all match)
- `tests/test_claude_service.py` confirmed modified (4 new tests added)
- RED commit `c46afc8` verified in git log
- GREEN commit `7b1924f` verified in git log
- 56 tests passing, no regressions
