# Phase 4 — AI Pattern Analysis Design

**Date:** 2026-05-26
**Goal:** Surface recurring behavioral patterns across the user's trade journal using Claude, so the user gets a coaching-style diagnosis of what they're doing well and where they're leaking edge.

---

## Overview

An on-demand "Analyze my trading" button on the Progress page sends the user's last 20 closed trades + skill scores to Claude. Claude returns 3–5 labeled patterns (problem / watch / strength). Results are stored in the existing `ai_patterns` table and shown on both the Progress page (full list) and the Home dashboard (top problem as a teaser).

A guard prevents re-analysis until at least one new closed trade has been logged since the last run, keeping API spend proportional to new data.

---

## Guard Conditions

The `POST /api/progress/analyze-patterns` endpoint enforces two gates before calling Claude:

1. **Minimum trade floor:** User must have ≥ 5 closed trades total. Returns `422 Unprocessable Entity` with message `"Need at least 5 closed trades to analyze patterns."` if not met.
2. **New-data gate:** At least one closed trade must have been created after `max(detected_at)` across the user's existing `AIPattern` rows. If no patterns exist yet, gate is skipped (first run always allowed). Returns `429 Too Many Requests` with message `"No new trades since last analysis."` if triggered.

---

## Backend

### New endpoints on `backend/routers/progress.py`

#### `GET /api/progress/patterns`

Returns the user's current patterns and enough metadata for the frontend to decide whether the analyze button should be enabled.

Response shape:
```json
{
  "patterns": [
    { "id": 1, "pattern_text": "...", "severity": "problem", "detected_at": "2026-05-26T..." }
  ],
  "last_analyzed_at": "2026-05-26T14:00:00Z",
  "min_trades_met": true,
  "can_analyze": true,
  "trade_range": "last 20 trades"
}
```

- `min_trades_met` is `true` when the user has ≥ 5 closed trades — controls whether the button is shown at all
- `can_analyze` is `true` when both guard conditions pass (≥5 trades AND ≥1 new trade since last run, or no prior run) — controls enabled/disabled state
- `last_analyzed_at` is `null` when no analysis has been run yet

#### `POST /api/progress/analyze-patterns`

1. Re-checks both guard conditions; returns `422` or `429` if either fails
2. Calls `get_user_coaching_context(user, db)` for the system prompt (prompt-cached)
3. Calls Claude with a user message requesting structured XML output (see Prompt section)
4. Parses XML — extracts `severity` + `pattern_text` per `<pattern>` element; returns `503` immediately if parsing fails (old patterns untouched)
5. Deletes all existing `AIPattern` rows for this user
6. Inserts 3–5 new `AIPattern` rows with `trade_range = "last 20 trades"`
7. Commits the transaction
8. Returns the new patterns array (same shape as `GET` `patterns` field)

Steps 5–7 happen in a single DB transaction. If Claude fails (step 3) or XML parsing fails (step 4), the handler returns `503` before touching the DB — old patterns are preserved.

### Claude prompt

**System block** (prompt-cached via `cache_control: ephemeral`):
```
{coaching_context from get_user_coaching_context()}
```

**User message:**
```
Analyze this trader's journal and identify 3 to 5 recurring behavioral patterns.
Return ONLY this XML — no other text:

<patterns>
  <pattern severity="problem">...</pattern>
  <pattern severity="watch">...</pattern>
  <pattern severity="strength">...</pattern>
</patterns>

Severity rules:
- problem: a repeated mistake actively costing edge (be specific, cite trade counts)
- watch: a tendency worth monitoring that isn't clearly hurting yet
- strength: a discipline the trader is consistently getting right

Each pattern_text must be one sentence, specific, and reference actual numbers from the data where possible.
```

Model: `claude-haiku-4-5-20251001` (fast, cheap; pattern extraction is a low-reasoning task).
Max tokens: 400.

### XML parsing

Use Python's `xml.etree.ElementTree` to parse the `<patterns>` block. If parsing fails (malformed XML, no `<patterns>` root, 0 valid children), return `503` — do not write partial data.

---

## Frontend

### `frontend/src/api.js`

Add two entries to the `progress` block:
```js
patterns: () => request('GET', '/progress/patterns'),
analyze:  () => request('POST', '/progress/analyze-patterns'),
```

### `frontend/src/pages/Progress.jsx`

New "AI Pattern Analysis" section below the skill bars:

- **On mount:** calls `api.progress.patterns()` and stores `{ patterns, canAnalyze, lastAnalyzedAt }`
- **"Analyze my trading" button:**
  - Hidden entirely when `minTradesMet === false` (user has < 5 closed trades)
  - Disabled (greyed, tooltip "Add a new trade first") when `minTradesMet === true && canAnalyze === false`
  - Shows spinner + "Analyzing…" text while POST is in flight
  - On success: replaces pattern list in-place, updates `lastAnalyzedAt`
  - On error: shows inline error message ("Analysis failed — try again")
- **Pattern list:** each row shows a colored severity pill + pattern text
  - `problem` → red pill
  - `watch` → yellow pill
  - `strength` → green pill
- **Footer:** "Last analyzed X ago · based on last 20 trades" (hidden when never run)

### `frontend/src/pages/Home.jsx`

New "Coaching Insight" card, rendered between the Training Session card and the grid:

- Calls `api.progress.patterns()` on mount alongside existing calls
- Displays the first `problem` pattern (falling back to first `watch`, then nothing)
- Shows nothing (no empty state) if no analysis has been run
- "See full analysis →" navigates to `/progress`

---

## Error handling summary

| Scenario | Backend response | Frontend behavior |
|---|---|---|
| < 5 closed trades | 422 | Button hidden (not shown yet) |
| No new trades since last run | 429 | Button disabled + tooltip |
| Claude call fails / timeout | 503 | Inline error, list unchanged |
| XML parse failure | 503 | Inline error, list unchanged |
| No patterns exist yet | 200, `patterns: []` | Empty state + enabled button |

---

## Tests

Follow the pattern in `tests/test_market.py`. New test file: `tests/test_progress_patterns.py`.

- `test_patterns_returns_empty_when_none_exist` — GET with no patterns in DB
- `test_patterns_returns_existing_patterns` — GET with seeded AIPattern rows
- `test_analyze_requires_5_trades` — POST with 3 closed trades → 422
- `test_analyze_requires_new_trade` — POST after analysis with no new trades → 429
- `test_analyze_writes_patterns` — POST with mocked Claude → patterns written to DB
- `test_analyze_replaces_old_patterns` — POST twice → only latest patterns remain
- `test_analyze_returns_503_on_claude_failure` — POST with Claude raising → 503

---

## Out of scope

- Keeping pattern history across runs (current design: replace on each run)
- Per-pattern "dismiss" or feedback UI
- Scheduling / automatic nightly trigger (Phase 4 is manual only)
- The `can_analyze` check for the 422 case on the frontend — button is hidden entirely until 5+ trades exist (handled by `canAnalyze` from the GET response)
