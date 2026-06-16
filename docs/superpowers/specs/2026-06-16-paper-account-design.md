# Design: Paper Account — Real Money Simulation

**Date:** 2026-06-16
**Status:** Approved

---

## Overview

Add a virtual paper account that simulates real money trading. Tracks starting balance (seeded from BullProfile, overrideable), realized P&L across all closed paper trades, capital deployed in open spread trades, and cash available. Displayed as a card at the top of the Progress page.

---

## Feature Scope

**Included:**
- Starting balance: seeded once from `BullProfile.account_size`, editable at any time
- Realized P&L: sum of `pnl` on all closed paper trades (all types)
- Current balance: starting balance + realized P&L
- Capital deployed: sum of max-loss exposure across open paper spread trades
- Cash available: current balance − capital deployed
- % at risk: capital deployed / starting balance × 100

**Excluded:**
- Live unrealized P&L (mark-to-market) — no option pricing API
- Capital deployed for equity paper trades (no share count stored)
- Balance history chart
- Separate `/paper-account` page

---

## Data Model

### New table: `paper_accounts`

```sql
CREATE TABLE paper_accounts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    starting_balance REAL NOT NULL,
    updated_at TEXT NOT NULL
);
```

One row per user. Added via lifespan `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` check in `backend/main.py` — no migration tool.

**No new fields on `Trade`** — all existing fields are sufficient:
- `practice = True` → paper trade
- `pnl` → realized P&L (set on close)
- `status` → `"open"` or `"closed"`
- `option_spread_type`, `option_short_strike`, `option_long_strike`, `entry` (= premium), `contracts` → capital deployed calculation

---

## Backend

### New file: `backend/routers/paper_account.py`

**`GET /api/paper-account`**

- Auth: `get_current_user`
- Returns the full account snapshot:

```json
{
  "starting_balance": 25000.00,
  "realized_pnl": 1240.00,
  "current_balance": 26240.00,
  "capital_deployed": 3250.00,
  "cash_available": 22990.00,
  "pct_at_risk": 13.0,
  "open_spread_count": 2,
  "closed_trade_count": 8
}
```

- Logic:
  1. Fetch `PaperAccount` for user; if none exists, auto-create from `BullProfile.account_size` (or $10,000 default if no profile)
  2. `realized_pnl` = sum of `trade.pnl` for closed paper trades where `pnl is not None`
  3. `current_balance` = `starting_balance + realized_pnl`
  4. `capital_deployed` = sum of `max_loss_per_spread(t)` for open paper spread trades
     - `max_loss_per_spread(t)` = `(abs(t.option_short_strike - t.option_long_strike) - t.entry) * 100 * t.contracts`
     - Skip if any required field is None
  5. `cash_available` = `current_balance - capital_deployed` (floor at 0 for display)
  6. `pct_at_risk` = `capital_deployed / starting_balance * 100` if starting_balance > 0 else 0

**`PUT /api/paper-account/balance`**

- Auth: `get_current_user`
- Body: `{ "starting_balance": 25000.00 }`
- Upserts `PaperAccount` row, sets `updated_at`
- Returns same snapshot as GET

### `backend/main.py`

- Mount router: `app.include_router(paper_account_router, prefix="/api")`
- Lifespan migration: `CREATE TABLE IF NOT EXISTS paper_accounts (...)`

---

## Frontend

### `frontend/src/api.js`

```js
paperAccount: {
  get:          ()     => request('GET',  '/paper-account'),
  setBalance:   (body) => request('PUT',  '/paper-account/balance', body),
},
```

### `frontend/src/pages/Progress.jsx`

New **Paper Account card** rendered above the existing paper stats section, shown only when `stats.paper?.closed_trades > 0` OR a `PaperAccount` row exists.

**Card layout:**

```
PAPER ACCOUNT
─────────────────────────────────────
Starting Balance          $25,000.00
Realized P&L               +$1,240   ← green/red
Current Balance            $26,240   ← green/red
─────────────────────────────────────
Capital Deployed            $3,250   (2 open spreads)
Cash Available             $22,990
% At Risk                    13.0%
                        [Edit Balance]
```

- **Edit Balance** button: inline input that calls `api.paperAccount.setBalance()`, re-fetches on success
- Loaded on mount alongside existing stats; graceful if endpoint returns 404/empty (card hidden)
- No new page or route

---

## Files Changed

| File | Change |
|---|---|
| `backend/models.py` | Add `PaperAccount` ORM model |
| `backend/main.py` | Lifespan migration + mount router |
| `backend/routers/paper_account.py` | New — GET + PUT endpoints |
| `frontend/src/api.js` | Add `api.paperAccount` namespace |
| `frontend/src/pages/Progress.jsx` | Add Paper Account card |

## Out of Scope

- Live unrealized P&L (mark-to-market)
- Equity trade exposure (no share count in model)
- Balance history / chart
- Separate dedicated page
- Resetting the account / trade history wipe
