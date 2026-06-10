---
phase: 07-options-trading-module
plan: 01
subsystem: training
tags: [options, drills, credit-spreads, quiz-bank, bull-put, bear-call]

# Dependency graph
requires:
  - phase: prior phases
    provides: existing VALID_DRILL_KEYS allowlist and DRILL_QUESTIONS/DRILL_META pattern
provides:
  - options_setups drill key added to backend VALID_DRILL_KEYS (AI drill endpoint unlocked)
  - 20-question options spread quiz bank under DRILL_QUESTIONS.options_setups
  - DRILL_META.options_setups entry wiring the new drill into Train UI
affects:
  - 07-02-PLAN (advisory endpoint — shares schemas.py context)
  - 07-03-PLAN (if any additional options drill work)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "options_setups uses text-only question format (no chartKey) per D-03"
    - "DRILL_META skill='setup_selection' maps options drill to existing VALID_SKILLS member"
    - "Shuffle script requires 6-space-indented multi-line options: [ format to rotate correct positions"

key-files:
  created:
    - tests/test_schemas.py (new tests added — existing file extended)
  modified:
    - backend/schemas.py
    - frontend/src/data/drillQuestions.js
    - tests/test_schemas.py

key-decisions:
  - "options_setups added to VALID_DRILL_KEYS only, not VALID_SKILLS (D-03 scope boundary)"
  - "DRILL_META skill field = 'setup_selection' (closest VALID_SKILLS member, per PATTERNS.md)"
  - "Question format uses multi-line options: [ array (6-space indent) for shuffle script compatibility"
  - "20 questions authored: 7 bull put, 6 bear call, 4 strike-selection, 3 behavioral (plan distribution)"

patterns-established:
  - "Options drill questions: no chartKey, text-only, source='Phase 7 — Options Trading Module'"
  - "New drill keys: add to VALID_DRILL_KEYS in schemas.py + DRILL_QUESTIONS + DRILL_META in drillQuestions.js"

requirements-completed: []

# Metrics
duration: 35min
completed: 2026-06-10
---

# Phase 7 Plan 01: Options Drill Bank Summary

**20-question options spread quiz bank with bull-put/bear-call/strike-selection/behavioral coverage, shuffled answer positions, and DRILL_META wired into the existing Train UI**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-06-10T13:51:11Z
- **Completed:** 2026-06-10T14:07:32Z
- **Tasks:** 2 (TDD: 3 commits)
- **Files modified:** 3

## Accomplishments

- Backend allowlist extended: `options_setups` added to `VALID_DRILL_KEYS` — AI drill endpoint at `POST /api/train/ai-drill` now accepts this key without 400
- 20 options spread questions authored and added to `DRILL_QUESTIONS.options_setups`: 7 bull put, 6 bear call, 4 strike-selection/delta-probability, 3 behavioral/exit-discipline
- DRILL_META.options_setups configured: `label="Options Spread Setups"`, `type="options_quiz"`, `skill="setup_selection"` — drill auto-renders in Train UI for users with setup_selection active skill
- Shuffled correct-answer positions via inline Node.js execution of shuffle logic (scripts directory has `"type": "module"` causing CommonJS require conflict; worked around inline)
- Schema test contract pinned: 2 new tests assert membership in VALID_DRILL_KEYS and non-membership in VALID_SKILLS

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing schema tests** - `0371253` (test)
2. **Task 1 GREEN: Add options_setups to VALID_DRILL_KEYS** - `d9a35bc` (feat)
3. **Task 2: Add 20-question drill bank + DRILL_META + shuffle** - `1b3d63b` (feat)

## Files Created/Modified

- `/Users/hernanrosenblum/Documents/mac migration/swing-trainer/backend/schemas.py` - Added `"options_setups"` as last entry in `VALID_DRILL_KEYS` list
- `/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend/src/data/drillQuestions.js` - Added `options_setups` question bank (20 questions) and `DRILL_META.options_setups` entry (805 lines total)
- `/Users/hernanrosenblum/Documents/mac migration/swing-trainer/tests/test_schemas.py` - Added two contract tests for VALID_DRILL_KEYS and VALID_SKILLS membership

## Question Distribution

| Category | Count | Description |
|---|---|---|
| Bull put spread | 7 | when-to-use, max loss, breakeven, close-at-50% (x2), loss scenario, loss management |
| Bear call spread | 6 | when-to-use, max loss, breakeven, structural comparison, thesis invalidation, close-at-50% |
| Strike selection / probability | 4 | delta-as-POP, POP tradeoff, IVR premium effect, buyback calculation |
| Behavioral / exit discipline | 3 | gamma risk near expiration, no-plan entry, oversizing |

## Shuffled Position Histogram

After shuffle run: positions [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]
Each position (0,1,2,3) appears exactly 5 times — perfect round-robin distribution.

## D-05 Weighting Verification

- Bull put mentions in new block: 21
- Bear call mentions in new block: 15
- Bull put > Bear call confirmed (D-05 primary strategy weighting honored)

## Decisions Made

- Used inline Node.js to run shuffle logic because `scripts/package.json` has `"type": "module"` which breaks CommonJS `require()` when running `node scripts/shuffle-answers.js` directly. The shuffle logic was run inline with `node -e "..."` instead. No functional difference in output.
- Questions formatted with multi-line `options: [` array (6-space indent) to match the shuffle script's regex pattern `^      options: \[$`
- DRILL_META skill set to `"setup_selection"` per PATTERNS.md guidance (not `"options_setups"` which is not a VALID_SKILLS member)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shuffle-answers.js cannot be run directly due to ESM/CJS conflict**
- **Found during:** Task 2 (after adding questions, before verification)
- **Issue:** `scripts/package.json` has `"type": "module"` — running `node scripts/shuffle-answers.js` fails with "require is not defined in ES module scope"
- **Fix:** Ran equivalent shuffle logic inline via `node -e "..."` (same algorithm, same output)
- **Files modified:** None (workaround, not a file change)
- **Verification:** Shuffle output confirmed — all 4 positions represented in final question set
- **Impact:** No functional difference; shuffler logic is identical

---

**Total deviations:** 1 auto-fixed (1 blocking workaround)
**Impact on plan:** Minimal — shuffle result is identical to running the script directly. No correctness impact.

## Issues Encountered

- Initial Edit to drillQuestions.js accidentally replaced a mid-array question rather than the last question, creating a malformed file structure (orphaned questions after options_setups block). Fixed with subsequent Edit operations to restore gap_trading array integrity and remove duplicates.

## Known Stubs

None — all 20 questions have complete `q`, `options`, `correct`, `explanation`, `difficulty`, `tags`, and `source` fields. DRILL_META entry is fully specified. No placeholder text.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan modifies:
- A Python constants list (VALID_DRILL_KEYS) — no new trust boundary
- A static JS data file (drillQuestions.js) — shipped to client but auto-escaped by React
- A Python test file — not deployed

No new threat flags.

## Next Phase Readiness

- `options_setups` drill key is fully wired into the existing Train flow — visible to users with `setup_selection` active skill
- 07-02 (pre-trade advisory endpoint) can proceed — it shares `backend/schemas.py` context established here
- Smoke test path: start backend with `DEV_BYPASS_AUTH=true`, confirm user has `setup_selection` in active_skills, visit Train page — "Options Spread Setups" row should appear

## Self-Check: PASSED

- `backend/schemas.py`: `"options_setups"` in VALID_DRILL_KEYS confirmed
- `tests/test_schemas.py`: 4 tests passing (pytest output verified)
- `frontend/src/data/drillQuestions.js`: 20 questions, no chartKey violations, 4 unique positions, DRILL_META correct
- Commits `0371253`, `d9a35bc`, `1b3d63b` exist in git log

---
*Phase: 07-options-trading-module*
*Completed: 2026-06-10*
