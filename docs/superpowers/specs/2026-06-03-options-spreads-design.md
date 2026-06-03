# Options Spread Trading — Design Spec
_2026-06-03_

## Goal

Add vertical spread options trading to the app. Options trades live alongside equity trades in the same journal, playbook, analytics, and progress tracking. The trade type (equity vs. option spread) is a label on each trade — everything else stays unified.

---

## Scope

**In scope:** single-leg vertical spreads (bull call, bear put, bull put, bear call), core mechanics only (strikes, expiry, premium, contracts).

**Out of scope:** Greeks tracking, multi-leg strategies beyond vertical spreads, options-specific drills (future work).

---

## Data Model

### New columns on `trades` (all nullable, added via lifespan migration)

| Column | Type | Notes |
|---|---|---|
| `trade_type` | TEXT, default `'equity'` | `equity` \| `option_spread` |
| `option_expiry` | TEXT | YYYY-MM-DD expiration date |
| `option_long_strike` | REAL | Strike price of the long leg |
| `option_short_strike` | REAL | Strike price of the short leg |
| `option_spread_type` | TEXT | `bull_call` \| `bear_put` \| `bull_put` \| `bear_call` |

### Repurposed existing fields for options

| Field | Options meaning |
|---|---|
| `entry` | Net premium per contract (debit paid or credit received) |
| `shares` | Number of contracts |
| `stop` | Stop-loss exit premium (e.g. 50% of debit paid) |
| `target` | Target exit premium |
| `exit` | Actual exit premium at close |
| `pnl` | Calculated at close (options formula) |
| `r_multiple` | `pnl / max_loss` |

### Computed values (returned in API, not stored)

Debit spreads: `bull_call`, `bear_put`
- **Max loss** = `entry × contracts × 100`
- **Max profit** = `(|long_strike − short_strike| − entry) × contracts × 100`
- **Breakeven**: bull call = `long_strike + entry`; bear put = `long_strike − entry`

Credit spreads: `bull_put`, `bear_call`
- **Max loss** = `(|long_strike − short_strike| − entry) × contracts × 100`
- **Max profit** = `entry × contracts × 100`
- **Breakeven**: bull put = `short_strike − entry`; bear call = `short_strike + entry`

### PnL at close
- Debit spreads: `(exit − entry) × contracts × 100`
- Credit spreads: `(entry − exit) × contracts × 100`

### R-multiple at close
`pnl / max_loss` (max_loss computed from spread structure)

---

## Backend Components

### `backend/main.py` — migration

Add 5 `ALTER TABLE IF NOT EXISTS` blocks in the lifespan block (same pattern as existing migrations):

```python
option_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(trades)"))]
for col, typedef in [
    ("trade_type",          "TEXT NOT NULL DEFAULT 'equity'"),
    ("option_expiry",       "TEXT"),
    ("option_long_strike",  "REAL"),
    ("option_short_strike", "REAL"),
    ("option_spread_type",  "TEXT"),
]:
    if col not in option_cols:
        conn.execute(text(f"ALTER TABLE trades ADD COLUMN {col} {typedef}"))
        conn.commit()
```

### `backend/schemas.py` — changes

**`TradeCreate`** — add optional fields:
```python
trade_type: str = "equity"                     # "equity" | "option_spread"
option_expiry: Optional[str] = None            # YYYY-MM-DD
option_long_strike: Optional[float] = None
option_short_strike: Optional[float] = None
option_spread_type: Optional[str] = None       # bull_call | bear_put | bull_put | bear_call
```

Validation (in `TradeCreate` or the route): if `trade_type == "option_spread"`, all four option fields must be present. Raise HTTP 400 otherwise.

**`TradeResponse`** — add:
```python
trade_type: str = "equity"
option_expiry: Optional[str] = None
option_long_strike: Optional[float] = None
option_short_strike: Optional[float] = None
option_spread_type: Optional[str] = None
max_profit: Optional[float] = None    # computed, not stored
max_loss: Optional[float] = None      # computed, not stored
breakeven: Optional[float] = None     # computed, not stored
```

### `backend/routers/trades.py` — changes

**Helper function** (add at top of file):
```python
DEBIT_SPREADS = {"bull_call", "bear_put"}

def _compute_option_metrics(trade) -> dict:
    ls = abs(trade.option_long_strike - trade.option_short_strike)
    entry = trade.entry
    contracts = trade.shares
    is_debit = trade.option_spread_type in DEBIT_SPREADS
    if is_debit:
        max_loss   = entry * contracts * 100
        max_profit = (ls - entry) * contracts * 100
        if trade.option_spread_type == "bull_call":
            breakeven = trade.option_long_strike + entry
        else:  # bear_put
            breakeven = trade.option_long_strike - entry
    else:
        max_loss   = (ls - entry) * contracts * 100
        max_profit = entry * contracts * 100
        if trade.option_spread_type == "bull_put":
            breakeven = trade.option_short_strike - entry
        else:  # bear_call
            breakeven = trade.option_short_strike + entry
    return {
        "max_loss":   round(max_loss, 2),
        "max_profit": round(max_profit, 2),
        "breakeven":  round(breakeven, 4),
    }
```

**`_to_response`** — extend to include options fields and computed metrics:
```python
def _to_response(t):
    base = { ...existing fields... }
    base["trade_type"] = t.trade_type or "equity"
    base["option_expiry"] = t.option_expiry
    base["option_long_strike"] = t.option_long_strike
    base["option_short_strike"] = t.option_short_strike
    base["option_spread_type"] = t.option_spread_type
    base["max_profit"] = None
    base["max_loss"] = None
    base["breakeven"] = None
    if t.trade_type == "option_spread" and t.option_spread_type:
        metrics = _compute_option_metrics(t)
        base.update(metrics)
    return base
```

**Open trade route** — store new fields:
```python
trade_type=body.trade_type,
option_expiry=body.option_expiry,
option_long_strike=body.option_long_strike,
option_short_strike=body.option_short_strike,
option_spread_type=body.option_spread_type,
```

**Close trade route** — branch PnL on `trade_type`:
```python
if trade.trade_type == "option_spread":
    is_debit = trade.option_spread_type in DEBIT_SPREADS
    if is_debit:
        pnl = (exit_price - trade.entry) * trade.shares * 100
    else:
        pnl = (trade.entry - exit_price) * trade.shares * 100
    metrics = _compute_option_metrics(trade)
    r_multiple = pnl / metrics["max_loss"] if metrics["max_loss"] else 0
else:
    # existing equity logic unchanged
```

---

## Frontend Components

### `frontend/src/components/TradeDrawer.jsx` — changes

**Type toggle** at the top of the open form:
```jsx
<div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
  {["equity", "option_spread"].map(t => (
    <button key={t} onClick={() => setForm(f => ({ ...f, trade_type: t }))}
      style={{ ... active style when form.trade_type === t ... }}>
      {t === "equity" ? "Equity" : "Option Spread"}
    </button>
  ))}
</div>
```

**Equity form**: unchanged (renders when `form.trade_type === "equity"`).

**Option spread form** (renders when `form.trade_type === "option_spread"`):
- Symbol, Trade date, Practice toggle (unchanged)
- Spread type dropdown: Bull Call / Bear Put / Bull Put / Bear call → sets `form.option_spread_type`
- Expiration date input (type="date") → sets `form.option_expiry`
- Long strike + Short strike: two side-by-side number inputs
- Net premium per contract (entry field, relabeled)
- Contracts (shares field, relabeled)
- Stop premium + Target premium (relabeled)
- Pre-note (unchanged)
- Direction dropdown: hidden

**Live info panel** (shown when option_long_strike, option_short_strike, entry, shares are all filled):
```
Max risk: $150  |  Max profit: $350  |  Breakeven: 452.50
```
Computed client-side using same formulas as backend.

**Position size helper** adapts when `trade_type === "option_spread"`:
- Suggested contracts = `floor(account × risk% / (premium × 100))`
- Label changes to "Max risk per contract × 100"

**Close form**: "Exit price" label → "Exit premium" when `trade.trade_type === "option_spread"`. No other changes.

### `frontend/src/pages/Journal.jsx` — changes

**Type column**: added before Symbol column. Equity rows show nothing. Option rows show a small badge with the spread type (e.g. "Bull Call") in the accent color.

**Symbol cell**: for option rows, a subtitle line shows `{long_strike} / {short_strike} · {formatted expiry}` (e.g. `450 / 455 · Jun 20`).

**Shares column**: relabeled to "Qty" — shows contracts for options, shares for equities. Both are integers.

**Entry column**: for option rows, shows premium value (visually identical, just context changes).

**Mobile expanded view**: shows spread type, long/short strikes, expiry, max profit, max loss, breakeven from the API response.

---

## Files Changed

| File | Change |
|---|---|
| `backend/main.py` | Add 5-column migration in lifespan |
| `backend/schemas.py` | Extend `TradeCreate` and `TradeResponse` |
| `backend/routers/trades.py` | Options metrics helper, store new fields, branch PnL at close |
| `frontend/src/components/TradeDrawer.jsx` | Type toggle, option spread form, live info panel, adapted position size helper |
| `frontend/src/pages/Journal.jsx` | Type badge, strike/expiry subtitle, relabeled columns |

---

## Out of Scope

- Greeks (delta, theta, IV) tracking
- Multi-leg strategies beyond vertical spreads
- Options-specific drills
- IV crush / theta decay warnings
- Brokerage integration for auto-importing option trades
