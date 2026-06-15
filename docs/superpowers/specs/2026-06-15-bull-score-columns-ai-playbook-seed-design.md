# Design: Bull Score Split Columns + AI Playbook Seed

**Date:** 2026-06-15  
**Status:** Approved

---

## Feature 1 — Split Bull Score Table Into Two Columns

### Problem

The candidates table currently shows `YOUR SCORE` and `AI SCORE` combined in a single 80px column with a `/` separator. This makes the two independent analyses hard to compare at a glance.

### Solution

Split the single combined column into two independent columns: `YOUR SCORE` and `AI SCORE`. Both columns are always visible. When a user has no playbook rules, `YOUR SCORE` shows `—`. When a user has rules, both scores appear side-by-side with the same color coding (green ≥7, yellow ≥4.5, red <4.5).

### Layout Change

```
Before (6 cols): TICKER | YOUR / AI | CONTRACTS | MAX LOSS | IV | SECTOR
After  (7 cols): TICKER | YOUR SCORE | AI SCORE | CONTRACTS | MAX LOSS | IV | SECTOR
```

Grid template changes from `'60px 80px 70px 80px 50px 1fr'` to `'60px 65px 65px 70px 80px 50px 1fr'`.

### Scope

- **Only file changed:** `frontend/src/pages/Bull.jsx`
- Update `CandidatesTable` header row (7 `<span>` columns)
- Update `CandidatesTable` data rows (7-column grid, each score in its own cell)
- The `ScoreBadge` component and expanded rationale section are unchanged — they already handle each score independently
- Remove the `hasUserScore` conditional that toggled between `YOUR / AI` and `AI SCORE` label — always show both columns

---

## Feature 2 — AI Playbook One-Click Seed

### Problem

The `AssistantPlaybookPanel` in `Bull.jsx` shows the 6 Bull AI rules and tells the user to manually recreate them in the Playbook tab. This is friction — the rules don't appear as a selectable setup in TradeDrawer or the Playbook page.

### Solution

Add a **"Save to My Playbook →"** button to `AssistantPlaybookPanel`. Clicking it seeds the 6 `BULL_ASSISTANT_PLAYBOOK` rules into the user's `playbook_rules` table as `setup_type = "bull_put_spread"`. Once seeded, the setup appears naturally everywhere: Playbook tab, TradeDrawer setup dropdown, and the checklist at trade close.

### Backend

**New endpoint:** `POST /api/bull/seed-playbook`

- Requires auth (`get_current_user`)
- Checks if any `PlaybookRule` with `user_id = current_user.id` and `setup_type = "bull_put_spread"` already exists
- If yes: returns `{"already_seeded": true, "setup_type": "bull_put_spread"}`
- If no: creates 6 `PlaybookRule` rows using `BULL_ASSISTANT_PLAYBOOK` list (index → `position`, all `tier = "must"`, `active = True`), commits, returns `{"already_seeded": false, "setup_type": "bull_put_spread", "created": 6}`
- No new DB model or migration needed — uses existing `PlaybookRule` model

**File:** `backend/routers/bull.py` — add one route. No changes to `backend/services/bull.py`.

### Frontend

**`AssistantPlaybookPanel` in `frontend/src/pages/Bull.jsx`:**

- On mount, check if already seeded: call `api.bull.seedPlaybook()` with a `GET`-like check, OR simply track `seeded` state and call seed on button click
- Simpler: track `seeded` state (default `false`). On button click, call `api.bull.seedPlaybook()`. On success, set `seeded = true` and show `"✓ Saved as Bull Put Spread"` with a link to `/playbook`. If response is `already_seeded: true`, show `"✓ Already in Playbook"` (button disabled).
- Replace the existing "To use this as your own playbook: go to Playbook…" paragraph with this button

**`frontend/src/api.js`:** Add `api.bull.seedPlaybook = () => post('/api/bull/seed-playbook', {})`.

### No Changes Needed

- `Playbook.jsx` — already renders all distinct `setup_type` values from `GET /playbook/setups`; seeded rules appear automatically
- `TradeDrawer.jsx` — already loads setups from `api.playbook.setups()`; seeded setup appears in dropdown automatically
- `backend/models.py`, `backend/schemas.py` — no new models or schemas needed
- No DB migrations needed

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/pages/Bull.jsx` | Split score column (Feature 1) + seed button in AssistantPlaybookPanel (Feature 2) |
| `backend/routers/bull.py` | Add `POST /seed-playbook` route |
| `frontend/src/api.js` | Add `api.bull.seedPlaybook` |

## Out of Scope

- Editing the seeded rules from the Bull page (use Playbook tab for that)
- Deleting / re-seeding (user manages rules in Playbook tab)
- Any changes to scoring logic or rationale display
