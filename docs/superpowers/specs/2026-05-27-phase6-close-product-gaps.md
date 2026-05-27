# Phase 6 — Close Product Gaps Design

**Date:** 2026-05-27
**Goal:** Close the four structural gaps identified in the product review: wire the playbook checklist into trade close (fixes plan adherence accuracy and AI debrief quality), add per-setup win rate analytics, bridge Watchlist to Journal, and fix two small UX issues.

---

## Overview

Four independent improvements shipped as one phase:

1. **Playbook checklist at trade close** — checklist infrastructure already exists on the open side; add it to close, write `ChecklistLog` rows, compute `checklist_score` from real checkboxes, pass rule detail to AI debrief
2. **Per-setup analytics** — aggregate closed trades by `setup_type`, expose as new endpoint, show on Progress page
3. **Watchlist → Journal bridge** — "Trade →" button pre-fills TradeDrawer symbol from watchlist item
4. **Journal date fix + pattern badge** — show `trade_date` not `created_at` in journal table; show dot on Progress nav after every 5th closed trade

---

## Item 1: Playbook Checklist at Trade Close

### What changes

The checklist already renders on the open-trade side of `TradeDrawer.jsx`. The close side (`mode === 'close'`) currently shows only exit_price and debrief. This item adds the same checklist to the close side and makes the backend compute `checklist_score` from it.

### Frontend — `TradeDrawer.jsx`

On `mode === 'close'`, fetch playbook rules for the trade's setup_type:

```javascript
useEffect(() => {
  if (mode !== 'close') return
  if (!trade?.setup_type) { setRules([]); return }
  api.playbook.rules(trade.setup_type)
    .then(r => {
      setRules(r)
      setChecked(Object.fromEntries(r.map(rule => [rule.id, false])))
    })
    .catch(() => {})
}, [mode, trade])
```

Show the checklist block in the close form, before exit_price. If `trade.setup_type` is null/empty, show:
```jsx
<div style={{ fontSize: 12, color: 'var(--dim)' }}>
  No setup type on this trade.{' '}
  <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => navigate('/playbook')}>
    Build your playbook →
  </span>
</div>
```

If setup_type is set but no rules exist for it, show:
```jsx
<div style={{ fontSize: 12, color: 'var(--dim)' }}>
  No playbook rules for "{trade.setup_type}" yet.{' '}
  <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => navigate('/playbook')}>
    Add rules →
  </span>
</div>
```

The checklist block (must/should/context tiers) reuses the same JSX already used in the open form. Compute score from must+should only.

On submit, include checklist items in the close payload:
```javascript
checklist_items: rules
  .filter(r => r.tier !== 'context')
  .map(r => ({ rule_id: r.id, checked: !!checked[r.id], tier: r.tier }))
```

`TradeDrawer` needs `useNavigate` imported from react-router-dom (for the "→ Playbook" links). Add to existing import.

### Backend — `schemas.py`

Add to `TradeClose`:
```python
class TradeClose(BaseModel):
    exit_price: float
    debrief: str
    checklist_items: list[dict] = []
    model_config = {"str_strip_whitespace": True}
```

### Backend — `trades.py` close_trade endpoint

After computing pnl/r_multiple and before committing, if `body.checklist_items` is non-empty:

1. Write `ChecklistLog` rows:
```python
for item in body.checklist_items:
    db.add(ChecklistLog(
        user_id=trade.user_id,
        trade_id=trade.id,
        rule_id=item["rule_id"],
        checked=item["checked"],
        tier=item["tier"],
    ))
```

2. Compute and store `checklist_score`:
```python
scoreable = [i for i in body.checklist_items if i["tier"] in ("must", "should")]
if scoreable:
    checked_count = sum(1 for i in scoreable if i["checked"])
    trade.checklist_score = round(checked_count / len(scoreable) * 100, 1)
```

If `checklist_items` is empty, leave `checklist_score` as-is (null for new trades).

### Backend — `claude.py` generate_trade_debrief

The function receives a `trade` ORM object. After the trade is committed, `close_trade` passes rule detail by loading the ChecklistLog rows. Add a helper `get_rule_detail(trade_id, db)` in `trades.py` that returns `{followed: [text, ...], violated: [text, ...]}` by joining `ChecklistLog` with `PlaybookRule`. Pass this to `generate_trade_debrief` as an optional second argument.

Add to the debrief prompt (after plan adherence score line):
```
- Rules followed: {", ".join(followed) or "none recorded"}
- Rules violated: {", ".join(violated) or "none recorded"}
```

`generate_trade_debrief` signature becomes:
```python
def generate_trade_debrief(trade, rule_detail: dict | None = None) -> str:
```

The `close_trade` endpoint calls:
```python
from backend.models import ChecklistLog, PlaybookRule
logs = db.query(ChecklistLog).filter(ChecklistLog.trade_id == trade.id).all()
if logs:
    rule_ids = [l.rule_id for l in logs]
    rule_texts = {r.id: r.text for r in db.query(PlaybookRule).filter(PlaybookRule.id.in_(rule_ids)).all()}
    followed  = [rule_texts[l.rule_id] for l in logs if l.checked and l.rule_id in rule_texts]
    violated  = [rule_texts[l.rule_id] for l in logs if not l.checked and l.rule_id in rule_texts]
    rule_detail = {"followed": followed, "violated": violated}
else:
    rule_detail = None
background_tasks.add_task(generate_and_store_debrief, trade.id, rule_detail)
```

The background task `generate_and_store_debrief` passes `rule_detail` to `generate_trade_debrief`.

### Tests

File: `tests/test_phase6.py`

- `test_close_trade_writes_checklist_logs` — POST close with `checklist_items`, assert `ChecklistLog` rows written
- `test_close_trade_computes_checklist_score` — POST close with 2 must (1 checked, 1 unchecked) → `checklist_score == 50.0`
- `test_close_trade_no_checklist_leaves_score_null` — POST close without checklist_items → `checklist_score` is None

---

## Item 2: Per-Setup Win Rate Analytics

### Backend — `progress.py`

New endpoint:
```python
@router.get("/setups")
def get_setup_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    trades = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.status == "closed",
        Trade.practice == False,
        Trade.setup_type != None,
        Trade.setup_type != "",
    ).all()

    from collections import defaultdict
    groups = defaultdict(list)
    for t in trades:
        groups[t.setup_type].append(t)

    result = []
    for setup, ts in sorted(groups.items()):
        wins = [t for t in ts if t.pnl is not None and t.pnl >= 0]
        r_vals = [t.r_multiple for t in ts if t.r_multiple is not None]
        result.append({
            "setup_type": setup,
            "trades":     len(ts),
            "wins":       len(wins),
            "win_rate":   round(len(wins) / len(ts) * 100, 1),
            "avg_r":      round(sum(r_vals) / len(r_vals), 2) if r_vals else None,
        })
    return result
```

### Frontend — `api.js`

Add to progress block:
```js
setups: () => request('GET', '/progress/setups'),
```

### Frontend — `Progress.jsx`

Add `setups` state, fetch in useEffect alongside stats. New "By Setup" section below stat tiles:

```jsx
{setups.length > 0 && (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
    <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 12 }}>By Setup</div>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ color: 'var(--muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
          <th style={{ padding: '4px 8px', fontWeight: 500 }}>Setup</th>
          <th style={{ padding: '4px 8px', fontWeight: 500 }}>Trades</th>
          <th style={{ padding: '4px 8px', fontWeight: 500 }}>Win %</th>
          <th style={{ padding: '4px 8px', fontWeight: 500 }}>Avg R</th>
        </tr>
      </thead>
      <tbody>
        {setups.map(s => (
          <tr key={s.setup_type} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{s.setup_type}</td>
            <td style={{ padding: '6px 8px', color: 'var(--text2)', fontFamily: 'monospace' }}>{s.trades}</td>
            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: s.win_rate >= 50 ? 'var(--green)' : 'var(--red)' }}>
              {s.win_rate}%
            </td>
            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: s.avg_r == null ? 'var(--muted)' : s.avg_r >= 1 ? 'var(--green)' : s.avg_r >= 0 ? 'var(--yellow)' : 'var(--red)' }}>
              {s.avg_r != null ? `${s.avg_r >= 0 ? '+' : ''}${s.avg_r}R` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

### Tests

- `test_setup_stats_groups_by_setup_type` — seed 2 breakout trades (1 win), 1 pullback trade (win), assert response shape
- `test_setup_stats_excludes_practice` — practice trades not counted
- `test_setup_stats_excludes_null_setup_type` — trades without setup_type not counted

---

## Item 3: Watchlist → Journal Bridge

### Frontend — `Watchlist.jsx`

Add a "Trade →" button to each watchlist row:
```jsx
<button
  className="btn-sm btn-ghost"
  style={{ fontSize: 11 }}
  onClick={() => navigate('/journal', { state: { prefill: { symbol: item.symbol } } })}
>
  Trade →
</button>
```

`useNavigate` must be imported from react-router-dom (check if already imported; add if not).

Update CSS grid to add room: `90px 180px 90px 1fr 80px 40px` (6 columns — new Trade button column before delete).

Add Trade button column header: `<span>Action</span>` (or empty span).

### Frontend — `Journal.jsx`

Import `useLocation` from react-router-dom. On mount, check for prefill state:
```javascript
const location = useLocation()

useEffect(() => {
  if (location.state?.prefill) {
    setDrawer({ mode: 'open', prefill: location.state.prefill })
    window.history.replaceState({}, '') // clear state so back-nav doesn't re-open drawer
  }
}, [])
```

Pass `prefill` to `TradeDrawer`:
```jsx
<TradeDrawer
  mode={drawer.mode}
  trade={drawer.trade}
  prefill={drawer.prefill}
  onSubmit={...}
  onClose={...}
/>
```

### Frontend — `TradeDrawer.jsx`

Accept `prefill` prop. In the form initialisation useEffect (or directly in useState), apply prefill:
```javascript
useEffect(() => {
  if (mode === 'open' && prefill?.symbol) {
    setForm(f => ({ ...f, symbol: prefill.symbol }))
  }
}, [mode, prefill])
```

---

## Item 4: Journal Date Fix + Pattern Badge

### Journal date fix — `Journal.jsx`

Find the date cell:
```jsx
{new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
```

Replace with:
```jsx
{new Date(t.trade_date || t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
```

### Pattern badge — `trades.py` + `Journal.jsx` + `App.jsx` (nav)

After closing a trade, the `close_trade` endpoint already returns the trade response. Add `closed_count` to the response:
```python
closed_count = db.query(Trade).filter(
    Trade.user_id == trade.user_id,
    Trade.status == "closed",
    Trade.practice == False,
).count()
# append to response dict
response["closed_count"] = closed_count
```

In `Journal.jsx` `handleClose`:
```javascript
async function handleClose(body) {
  const result = await api.trades.close(drawer.trade.id, body)
  await loadTrades()
  const count = result?.closed_count
  if (count && count >= 5 && count % 5 === 0) {
    sessionStorage.setItem('analysis_available', '1')
    window.dispatchEvent(new Event('analysis-badge'))
  }
}
```

In the nav/sidebar (wherever the Progress link is rendered), listen for `'analysis-badge'` and check `sessionStorage.getItem('analysis_available')`. Show a small red dot next to "Progress". Clear the flag when the user navigates to `/progress`.

---

## Out of Scope

- Checklist enforcement at trade open (already exists — must-haves block submission)
- Per-rule accuracy tracking over time
- Editing checklist after a trade is closed
- Filtering journal by setup type
- Mobile layout (Phase 7)
- Stock scanner (Phase 8)
