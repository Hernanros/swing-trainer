# AI Debrief Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three product gaps: (1) trade debrief now sends option-spread data in equity language and runs without user context; (2) weekly stats on Home bucket by `created_at` instead of `trade_date`; (3) Home shows no earnings alert for open positions near an earnings date.

**Architecture:** Task 1 changes `backend/services/claude.py` (debrief prompt branches on trade_type, accepts coaching_context) and its two callers in `backend/routers/trades.py`. Tasks 2 and 3 are frontend-only changes to `frontend/src/pages/Home.jsx`.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy, React 18 / Vite, Anthropic SDK, Finnhub (market earnings endpoint already exists)

---

## File Map

| File | Change |
|---|---|
| `backend/services/claude.py` | Add `_DEBIT_SPREADS` + `_SPREAD_LABELS` module constants; rewrite `generate_trade_debrief` to accept `coaching_context: str = ""` and branch prompt on `trade.trade_type` |
| `backend/routers/trades.py` | Update `_generate_debrief_bg` to fetch user + pass coaching context; update `generate_ai_debrief` endpoint same way |
| `tests/test_claude_service.py` | Three new tests for the updated `generate_trade_debrief` signature |
| `frontend/src/pages/Home.jsx` | Fix `created_at` → `trade_date` on line 76; add `earningsMap` state + effect; render earnings badge on open positions |

---

## Task 1: Option-aware debrief + coaching context

**Files:**
- Modify: `backend/services/claude.py` (full rewrite of `generate_trade_debrief`, add two module-level constants)
- Modify: `backend/routers/trades.py` (lines 49-61 `_generate_debrief_bg`, lines 266-283 `generate_ai_debrief`)
- Test: `tests/test_claude_service.py`

### Context

`generate_trade_debrief` currently:
- Has signature `(trade, rule_detail=None)` — no user context
- Formats the prompt with equity labels ("Direction", "Entry/Stop/Target/Exit", "Shares") even for option spread trades

The fix has two parts:
1. Add `coaching_context: str = ""` parameter; when non-empty, embed it in the prompt so Claude knows who the student is
2. Branch on `trade.trade_type == "option_spread"` to use spread-appropriate labels and paragraphs

The two callers in `trades.py` must be updated to pass the context. Both already have access to a DB session and the user ID (`trade.user_id` on the model object).

- [ ] **Step 1: Write three failing tests**

Add to the end of `tests/test_claude_service.py`:

```python
def test_debrief_returns_unavailable_when_no_api_key(db, user):
    from backend.models import Trade
    trade = Trade(
        user_id=user.id, symbol="AAPL", direction="long",
        entry=150.0, stop=145.0, target=165.0, exit=162.0,
        shares=10, status="closed", date="2026-06-01",
        pnl=120.0, r_multiple=2.4, trade_type="equity",
    )
    db.add(trade)
    db.commit()
    from backend.services import claude as svc
    result = svc.generate_trade_debrief(trade)
    assert "unavailable" in result.lower()


def test_debrief_accepts_coaching_context_param(db, user):
    from backend.models import Trade
    trade = Trade(
        user_id=user.id, symbol="AAPL", direction="long",
        entry=150.0, stop=145.0, target=165.0, exit=162.0,
        shares=10, status="closed", date="2026-06-01",
        pnl=120.0, r_multiple=2.4, trade_type="equity",
    )
    db.add(trade)
    db.commit()
    from backend.services import claude as svc
    # Must accept the new parameter without error
    result = svc.generate_trade_debrief(trade, coaching_context="User: Alice | Stage: active")
    assert "unavailable" in result.lower()


def test_debrief_accepts_option_spread_trade(db, user):
    from backend.models import Trade
    trade = Trade(
        user_id=user.id, symbol="SPY", direction="long",
        trade_type="option_spread", option_spread_type="bull_call",
        option_long_strike=450.0, option_short_strike=455.0,
        option_expiry="2026-07-18",
        entry=1.50, stop=0.75, target=3.00, exit=3.00,
        shares=2, status="closed", date="2026-06-01",
        pnl=300.0, r_multiple=1.0,
    )
    db.add(trade)
    db.commit()
    from backend.services import claude as svc
    # Must not crash when trade_type is option_spread (no API key, so returns unavailable)
    result = svc.generate_trade_debrief(trade)
    assert "unavailable" in result.lower()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python -m pytest tests/test_claude_service.py::test_debrief_returns_unavailable_when_no_api_key tests/test_claude_service.py::test_debrief_accepts_coaching_context_param tests/test_claude_service.py::test_debrief_accepts_option_spread_trade -v
```

Expected: all three PASS already for the first test (existing behavior returns "unavailable"), but `test_debrief_accepts_coaching_context_param` will FAIL with `TypeError: generate_trade_debrief() got an unexpected keyword argument 'coaching_context'`, and `test_debrief_accepts_option_spread_trade` will PASS (early return before prompt is built). Confirm at least one fails.

- [ ] **Step 3: Rewrite `generate_trade_debrief` in `backend/services/claude.py`**

Replace everything from line 65 to the end of the function (line 99). Also add two module-level constants right before the function. The final state of `backend/services/claude.py` from line 1 through line 99:

```python
import os
import xml.etree.ElementTree as ET
from typing import Optional

_api_key = os.getenv("ANTHROPIC_API_KEY")

_SKILL_LABELS = {
    "setup_selection":    "Setup Selection",
    "entry_timing":       "Entry Timing",
    "trade_management":   "Trade Management",
    "emotional_discipline": "Emotional Discipline",
    "chart_reading":      "Chart Reading",
    "risk_sizing":        "Risk Sizing",
}

_DEBIT_SPREADS = {"bull_call", "bear_put"}
_SPREAD_LABELS = {
    "bull_call": "Bull Call",
    "bear_put":  "Bear Put",
    "bull_put":  "Bull Put",
    "bear_call": "Bear Call",
}


def get_user_coaching_context(user, db) -> str:
    from backend.models import SkillScore, Trade

    lines = [f"User: {user.name} | Stage: {user.trading_stage} | Budget: {user.time_budget}"]

    scores = db.query(SkillScore).filter(SkillScore.user_id == user.id).all()
    if scores:
        weakest = min(scores, key=lambda s: s.score)
        weakest_label = _SKILL_LABELS.get(weakest.skill, weakest.skill)
        score_parts = [
            f"{_SKILL_LABELS.get(s.skill, s.skill)}: {s.score:.0f}"
            for s in sorted(scores, key=lambda s: s.score)
        ]
        lines.append(f"Weakest skill: {weakest_label} ({weakest.score:.0f})")
        lines.append("Skill scores: " + ", ".join(score_parts))

    trades = (
        db.query(Trade)
        .filter(Trade.user_id == user.id, Trade.status == "closed", Trade.practice == False)
        .order_by(Trade.created_at.desc())
        .limit(20)
        .all()
    )
    if trades:
        lines.append(f"\nRecent trades (last {len(trades)} closed):")
        for t in trades:
            checklist = f", checklist {t.checklist_score:.0f}%" if t.checklist_score is not None else ""
            setup = f" {t.setup_type}" if t.setup_type else ""
            r_str = f"{t.r_multiple:.2f}R" if t.r_multiple is not None else "?R"
            lines.append(f"  {t.symbol} {t.direction}{setup}: {r_str}{checklist}")

    return "\n".join(lines)


def call_claude(prompt: str, max_tokens: int = 1000) -> str:
    """Generic helper: sends a single user message and returns the text response."""
    if not _api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def generate_trade_debrief(trade, rule_detail: Optional[dict] = None, coaching_context: str = "") -> str:
    if not _api_key:
        return "[AI debrief unavailable — set ANTHROPIC_API_KEY to enable]"
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)

    followed_str = ", ".join(rule_detail["followed"]) if rule_detail and rule_detail.get("followed") else "none recorded"
    violated_str = ", ".join(rule_detail["violated"]) if rule_detail and rule_detail.get("violated") else "none recorded"

    if (trade.trade_type or "equity") == "option_spread":
        long_s   = trade.option_long_strike  or 0.0
        short_s  = trade.option_short_strike or 0.0
        width    = abs(long_s - short_s)
        is_debit = trade.option_spread_type in _DEBIT_SPREADS
        if is_debit:
            max_loss   = round(trade.entry * trade.shares * 100, 2)
            max_profit = round((width - trade.entry) * trade.shares * 100, 2)
        else:
            max_loss   = round((width - trade.entry) * trade.shares * 100, 2)
            max_profit = round(trade.entry * trade.shares * 100, 2)
        spread_label  = _SPREAD_LABELS.get(trade.option_spread_type, trade.option_spread_type)
        bias_label    = "Bullish" if trade.option_spread_type in ("bull_call", "bull_put") else "Bearish"
        premium_label = "paid" if is_debit else "received"
        trade_block = (
            f"- Symbol: {trade.symbol} | Spread: {spread_label} "
            f"({'debit' if is_debit else 'credit'}) | Bias: {bias_label}\n"
            f"- Strikes: {trade.option_long_strike}/{trade.option_short_strike} | Expiry: {trade.option_expiry}\n"
            f"- Premium {premium_label}: ${trade.entry} | Exit premium: ${trade.exit} | Contracts: {trade.shares}\n"
            f"- P&L: ${trade.pnl:.2f} ({trade.r_multiple:.2f}R vs max risk)\n"
            f"- Max risk: ${max_loss} | Max profit: ${max_profit}\n"
            f"- Setup type: {trade.setup_type or 'Not specified'}\n"
            f"- Plan adherence score: {f'{trade.checklist_score:.0f}%' if trade.checklist_score is not None else 'N/A'}\n"
            f"- Rules followed: {followed_str}\n"
            f"- Rules violated: {violated_str}\n"
            f"- Pre-trade note: {trade.pre_note or 'None'}"
        )
        paragraphs = (
            "Write exactly 4 short paragraphs:\n"
            "1. Plan adherence — did the spread selection and setup match the pre-trade note and checklist?\n"
            "2. Spread structure — were the strikes, expiry, and premium appropriate for the thesis?\n"
            "3. Risk management — was position size appropriate relative to max risk, and was the trade managed well?\n"
            "4. Key lesson — one specific, actionable observation from this trade."
        )
    else:
        trade_block = (
            f"- Symbol: {trade.symbol} | Direction: {trade.direction}\n"
            f"- Entry: ${trade.entry} | Stop: ${trade.stop} | Target: ${trade.target} | Exit: ${trade.exit}\n"
            f"- Shares: {trade.shares} | P&L: ${trade.pnl:.2f} ({trade.r_multiple:.2f}R)\n"
            f"- Setup type: {trade.setup_type or 'Not specified'}\n"
            f"- Plan adherence score: {f'{trade.checklist_score:.0f}%' if trade.checklist_score is not None else 'N/A'}\n"
            f"- Rules followed: {followed_str}\n"
            f"- Rules violated: {violated_str}\n"
            f"- Pre-trade note: {trade.pre_note or 'None'}"
        )
        paragraphs = (
            "Write exactly 4 short paragraphs:\n"
            "1. Plan adherence — did the trade match the pre-trade note and checklist?\n"
            "2. Entry quality — was entry precise and well-timed?\n"
            "3. Risk management — was the stop structural, sized correctly, and honoured?\n"
            "4. Key lesson — one specific, actionable observation from this trade."
        )

    context_block = f"\nStudent context:\n{coaching_context}\n" if coaching_context else ""
    prompt = (
        f"You are a professional swing trading coach. Analyze this trade and write a concise debrief."
        f"{context_block}\n"
        f"Trade:\n{trade_block}\n\n"
        f"{paragraphs}\n\n"
        f"Be direct and specific. No generic advice."
    )

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text
```

- [ ] **Step 4: Update `_generate_debrief_bg` in `backend/routers/trades.py`**

Replace lines 49-61 with:

```python
def _generate_debrief_bg(trade_id: int, rule_detail: Optional[dict] = None) -> None:
    db = SessionLocal()
    try:
        trade = db.query(Trade).filter(Trade.id == trade_id).first()
        if not trade or trade.status != "closed" or trade.ai_debrief:
            return
        user = db.query(User).filter(User.id == trade.user_id).first()
        coaching_context = claude_service.get_user_coaching_context(user, db) if user else ""
        trade.ai_debrief = claude_service.generate_trade_debrief(trade, rule_detail, coaching_context)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Background debrief failed for trade %s", trade_id)
    finally:
        db.close()
```

- [ ] **Step 5: Update `generate_ai_debrief` endpoint in `backend/routers/trades.py`**

Replace lines 266-283 with:

```python
@router.post("/{trade_id}/ai-debrief", response_model=TradeResponse)
def generate_ai_debrief(
    trade_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trade = db.query(Trade).filter(
        Trade.id == trade_id,
        Trade.user_id == current_user.id,
    ).first()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != "closed":
        raise HTTPException(400, "Trade must be closed before generating a debrief")
    coaching_context = claude_service.get_user_coaching_context(current_user, db)
    trade.ai_debrief = claude_service.generate_trade_debrief(trade, coaching_context=coaching_context)
    db.commit()
    db.refresh(trade)
    return _to_response(trade)
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python -m pytest tests/test_claude_service.py -v
```

Expected: all 9 tests PASS (6 pre-existing + 3 new).

- [ ] **Step 7: Run full backend test suite to confirm no regressions**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python -m pytest tests/ -v --tb=short
```

Expected: all tests pass. If `test_options.py` or `test_trades.py` fail, check that the `_generate_debrief_bg` and `generate_ai_debrief` function signatures still match what the callers expect.

- [ ] **Step 8: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add backend/services/claude.py backend/routers/trades.py tests/test_claude_service.py
git commit -m "feat: option-aware debrief prompt + wire coaching context into all debriefs"
```

---

## Task 2: Fix `trade_date` weekly bucketing bug in Home.jsx

**Files:**
- Modify: `frontend/src/pages/Home.jsx:76`

### Context

`Home.jsx` computes this week's closed trades at line 74-78:

```js
const weekClosed = trades.filter(t => {
  if (t.status !== 'closed') return false
  const d = new Date(t.created_at)   // ← bug: should use trade_date
  return d >= monday && d <= sunday
})
```

`t.created_at` is the DB insert timestamp (ISO string like `"2026-06-04T22:11:03"`). A trade entered Sunday evening at 11 PM ET would appear in the *next* week's stats when bucketed by `created_at`. `t.trade_date` is the user-specified trade date string (e.g., `"2026-06-04"`). The fix also needs the `T00:00:00` suffix to prevent the JS timezone-shift bug (without it, `new Date("2026-06-04")` is interpreted as UTC midnight and renders as the prior day in any UTC- timezone). `t.trade_date` may be null for very old records, so fall back to `t.created_at.split('T')[0]`.

- [ ] **Step 1: Apply the one-line fix**

In `frontend/src/pages/Home.jsx`, replace line 76:

Old:
```js
  const d = new Date(t.created_at)
```

New:
```js
  const d = new Date((t.trade_date || t.created_at.split('T')[0]) + 'T00:00:00')
```

- [ ] **Step 2: Verify the change looks correct**

```bash
grep -n "trade_date\|created_at" "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend/src/pages/Home.jsx"
```

Expected output includes the updated line 76 with `t.trade_date || t.created_at.split('T')[0]`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/pages/Home.jsx
git commit -m "fix: bucket weekly stats by trade_date not created_at"
```

---

## Task 3: Earnings alert on open positions

**Files:**
- Modify: `frontend/src/pages/Home.jsx` (add state, add effect, update open-positions render)

### Context

The earnings API already exists: `GET /market/earnings/{symbol}` returns `{ date: "YYYY-MM-DD" }` or 404 if no upcoming earnings. `api.market.earnings(symbol)` in `frontend/src/api.js` wraps it.

The Open Positions card is rendered at lines 207-229. It maps `openTrades` and shows symbol, direction, entry, stop. We add a yellow "EARNINGS Jun 10" badge inline with the symbol when earnings fall within 7 days.

The effect depends on `trades` (not `openTrades`, since `openTrades` is a derived const — React won't track derived values as effect deps). It uses `Promise.allSettled` so a 404 for one symbol doesn't break the others.

- [ ] **Step 1: Add `earningsMap` state**

In `frontend/src/pages/Home.jsx`, find the existing state declarations (lines 57-60):

```js
const [trades, setTrades]     = useState([])
const [skills, setSkills]     = useState([])
const [today, setToday]       = useState(null)
const [patterns, setPatterns] = useState([])
```

Add one line after the `patterns` state:

```js
const [trades, setTrades]       = useState([])
const [skills, setSkills]       = useState([])
const [today, setToday]         = useState(null)
const [patterns, setPatterns]   = useState([])
const [earningsMap, setEarningsMap] = useState({})
```

- [ ] **Step 2: Add earnings fetch effect**

After the existing `useEffect` block that ends at line 69, add a new effect:

```js
  useEffect(() => {
    const open = trades.filter(t => t.status === 'open')
    if (open.length === 0) return
    const symbols = [...new Set(open.map(t => t.symbol))]
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const cutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    Promise.allSettled(
      symbols.map(sym => api.market.earnings(sym).then(data => ({ sym, date: data.date })))
    ).then(results => {
      const map = {}
      results.forEach(r => {
        if (r.status !== 'fulfilled') return
        const { sym, date } = r.value
        const d = new Date(date + 'T00:00:00')
        if (d >= now && d <= cutoff) map[sym] = date
      })
      setEarningsMap(map)
    })
  }, [trades])
```

- [ ] **Step 3: Render earnings badge in Open Positions card**

Find the symbol/direction line inside the open positions map (around line 217):

Old:
```jsx
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                    {t.symbol}{' '}
                    <span style={{ fontWeight: 400, color: t.direction === 'long' ? 'var(--green)' : 'var(--red)', fontSize: 11, textTransform: 'uppercase' }}>
                      {t.direction}
                    </span>
                  </div>
```

New:
```jsx
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                    {t.symbol}{' '}
                    <span style={{ fontWeight: 400, color: t.direction === 'long' ? 'var(--green)' : 'var(--red)', fontSize: 11, textTransform: 'uppercase' }}>
                      {t.direction}
                    </span>
                    {earningsMap[t.symbol] && (
                      <span style={{ marginLeft: 6, color: 'var(--yellow)', fontSize: 10, fontWeight: 700 }}>
                        {'EARNINGS ' + new Date(earningsMap[t.symbol] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
```

- [ ] **Step 4: Verify the diff**

```bash
grep -n "earningsMap\|earnings" "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend/src/pages/Home.jsx"
```

Expected: lines for the state, the effect, and the badge render all show up.

- [ ] **Step 5: Build frontend to check for compile errors**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend"
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/pages/Home.jsx
git commit -m "feat: show earnings alert badge on open positions within 7 days"
```
