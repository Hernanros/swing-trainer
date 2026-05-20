# Phase 3 Session Summary — Playbook, Enhanced Journal & Progress Tab

**Date:** 2026-05-13  
**Branch:** master  
**Status:** Complete — pushed to Railway

---

## What Was Built

### Phase 3 Scope
Add a Playbook system (setup types + tiered rules), wire a checklist and practice toggle into the trade open form, and replace the Progress tab placeholder with real skill bars and stat tiles.

### The Session (Two Parts)

**Part 1 — Deployment debug (Phase 2 black screen fix)**

The Phase 2 Railway deploy showed a blank screen. Root cause: Vite produces different content-hash filenames on Linux (Docker/Railway) vs Windows (local). The deployed `index.html` referenced a hash that didn't match what the Docker build produced.

Fix applied:
- Removed `dist/` from `.gitignore`
- Stripped the Node build stage from the Dockerfile (Python-only, single stage)
- Committed `frontend/dist/` pre-built locally — Railway copies it directly, no rebuild
- Bumped service worker cache from `swingtrainer-v1` → `swingtrainer-v2` to clear stale browser caches

Result: App loading correctly. Rule locked in: **always `npm run build` locally and commit `frontend/dist/` before pushing any frontend changes.**

**Part 2 — Phase 3 implementation (this session)**

7 backend/frontend tasks, 5 commits, 48/48 tests green.

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/routers/playbook.py` | 5 endpoints: list setups, list/create/update/delete rules |
| `backend/routers/progress.py` | `/stats` — win rate, avg R, plan adherence, total P&L |
| `tests/test_playbook.py` | 9 tests for playbook CRUD |
| `tests/test_progress.py` | 3 tests for progress stats |
| `frontend/src/pages/Playbook.jsx` | Setup type manager + tiered rule builder |

## Files Modified

| File | Change |
|------|--------|
| `backend/schemas.py` | Extended `TradeCreate`/`TradeResponse` with `setup_type`, `practice`, `checklist_score`; added `PlaybookRuleCreate/Update/Response`, `VALID_TIERS` |
| `backend/routers/trades.py` | `_to_response` + `open_trade` updated to persist the three new fields |
| `backend/main.py` | Registered `playbook` and `progress` routers; added `PRAGMA ALTER TABLE` migration for `practice` + `checklist_score` columns |
| `frontend/src/api.js` | Added `api.playbook` (5 methods) and `api.progress.stats()`; added 204 guard to `request()` |
| `frontend/src/components/TradeDrawer.jsx` | Full rewrite: setup type dropdown (from playbook), inline checklist, must-have blocking, checklist score computation, practice toggle |
| `frontend/src/pages/Progress.jsx` | Replaced placeholder with stat tiles (win rate, avg R, plan adherence, P&L) and skill score bars |
| `frontend/src/components/Sidebar.jsx` | Added Playbook nav item (📋) between Journal and Watchlist |
| `frontend/src/App.jsx` | Added `/playbook` route |
| `frontend/src/styles/globals.css` | Added Playbook styles (section cards, rule rows, add-row inputs) and Progress styles (stat tiles, skill bars) |
| `tests/test_trades.py` | Added 2 tests for `setup_type`, `practice`, `checklist_score` round-trip |

---

## Key Design Decisions

**Tiered playbook rules**
- `must` — blocks the "Open Trade" button if unchecked. Enforces process discipline.
- `should` — counts toward the checklist score but doesn't block.
- `context` — display-only note, no checkbox, not scored.

**Checklist score computation**
Computed client-side at submit time: `(checked must+should) / (total must+should) * 100`. Sent to backend as `checklist_score` float on the trade. Drives the "Plan Adherence" stat on the Progress tab.

**Setup types are implicit**
No separate setup-type table. Setup types are derived as `DISTINCT setup_type` values from active `PlaybookRule` rows. Adding a first rule creates the setup type; deleting all its rules removes it from the list.

**DB migration strategy**
`PRAGMA table_info` + `ALTER TABLE` inside the FastAPI lifespan function. Idempotent — runs on every boot, skips columns that already exist. Deployed DB picks up new columns without a migration tool.

**Pre-built frontend dist**
`frontend/dist/` is committed to git. Railway's Dockerfile copies it directly — no npm/node in the image. Eliminates the Linux/Windows Vite hash mismatch that caused the Phase 2 black screen.

---

## Commits (Phase 3)

```
7f9fbb5  feat: extend trade schema with setup_type, practice, checklist_score
f4d74b6  feat: playbook router — setup types and tiered rules CRUD
bae9372  feat: progress stats endpoint — win rate, avg R, plan adherence, total P&L
b371e3a  feat: add playbook and progress API methods to frontend client
7cc75b2  feat: Playbook page — manage setup types and tiered rules
c3cabe5  feat: TradeDrawer — setup type dropdown, playbook checklist, practice toggle
9dd62fb  feat: Progress tab — skill bars, stat tiles (win rate, avg R, plan adherence, P&L)
```

---

## Test Coverage

| File | Tests |
|------|-------|
| `test_auth.py` | 4 |
| `test_db.py` | 2 |
| `test_schemas.py` | 2 |
| `test_users.py` | 11 |
| `test_trades.py` | 16 |
| `test_playbook.py` | 9 |
| `test_progress.py` | 3 |
| **Total** | **48** |

---

## What's Deferred (Phase 4)

| Feature | Reason deferred |
|---------|-----------------|
| Skill score updates from trades | Primary driver is drills, not trades |
| AI auto-debrief on close | Requires Claude API integration |
| Drills / Train tab | Requires yfinance + Claude drill generation |
| Watchlist with live prices | Requires yfinance |
| Drag-and-drop rule reordering | UX nice-to-have, not blocking |
| ChecklistLog per-rule storage | Aggregated score is sufficient for now |
