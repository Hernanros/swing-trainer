# Phase 6 — Close Product Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four structural product gaps: wire the playbook checklist into trade close (fixing AI debrief quality), add per-setup analytics, bridge Watchlist to Journal, and fix the journal date display + add an analysis-available badge.

**Architecture:** Four independent items shipped in one phase. Backend changes first (schema + endpoints + tests), then frontend changes in order of dependency (API → pages → components). All tests live in `tests/test_phase6.py`.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React/Vite (frontend), pytest + TestClient (tests)

---

## File Map

| File | Change |
|------|--------|
| `backend/schemas.py` | Add `checklist_items` to `TradeClose`; add `closed_count` to `TradeResponse` |
| `backend/routers/trades.py` | Update `close_trade`: write ChecklistLog rows, compute score, assemble rule_detail, return closed_count |
| `backend/services/claude.py` | `generate_trade_debrief(trade, rule_detail=None)` — add followed/violated rules to prompt |
| `backend/routers/progress.py` | New `GET /progress/setups` endpoint |
| `frontend/src/api.js` | Add `progress.setups()` |
| `frontend/src/pages/Progress.jsx` | Fetch setups, render "By Setup" table |
| `frontend/src/components/TradeDrawer.jsx` | Close-mode checklist, `prefill` prop |
| `frontend/src/pages/Journal.jsx` | Date fix, prefill from location state, badge dispatch on close |
| `frontend/src/pages/Watchlist.jsx` | "Trade →" button per row, grid update |
| `frontend/src/components/Sidebar.jsx` | Analysis-available red dot on Progress link |
| `frontend/src/styles/globals.css` | Update `.wl-header` grid to 6 columns |
| `tests/test_phase6.py` | 6 new tests |

---

## Task 1: Backend — TradeClose schema + ChecklistLog writes + closed_count

**Files:**
- Modify: `backend/schemas.py:67-71`
- Modify: `backend/routers/trades.py:1-145`
- Create: `tests/test_phase6.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_phase6.py`:

```python
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
import backend.auth as auth_module

TEST_DB_URL = "sqlite://"
_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

auth_module.DEV_BYPASS_AUTH = True

OPEN_TRADE = {
    "symbol": "AAPL",
    "direction": "long",
    "entry_price": 100.0,
    "stop_price": 95.0,
    "target_price": 115.0,
    "shares": 10,
    "practice": False,
    "setup_type": "breakout",
}


@pytest.fixture(autouse=True)
def reset_db():
    saved_db = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = lambda: _Session()
    Base.metadata.create_all(bind=_engine)
    db = _Session()
    from backend.models import User
    user = User(
        name="Tester",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=json.dumps(["chart_reading"]),
    )
    db.add(user)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved_db:
        app.dependency_overrides[get_db] = saved_db
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def _create_rule(text="Volume above avg", tier="must"):
    r = client.post("/playbook/rules", json={
        "setup_type": "breakout", "text": text, "tier": tier, "position": 0,
    })
    assert r.status_code == 201
    return r.json()


def _open_trade(setup_type="breakout"):
    t = client.post("/trades/", json={**OPEN_TRADE, "setup_type": setup_type})
    assert t.status_code == 201
    return t.json()


def _close_trade(trade_id, checklist_items=None):
    body = {"exit_price": 110.0, "debrief": "Good trade."}
    if checklist_items is not None:
        body["checklist_items"] = checklist_items
    r = client.put(f"/trades/{trade_id}/close", json=body)
    assert r.status_code == 200
    return r.json()


def test_close_trade_writes_checklist_logs():
    rule = _create_rule()
    trade = _open_trade()
    _close_trade(trade["id"], [{"rule_id": rule["id"], "checked": True, "tier": "must"}])
    db = _Session()
    from backend.models import ChecklistLog
    logs = db.query(ChecklistLog).all()
    db.close()
    assert len(logs) == 1
    assert logs[0].rule_id == rule["id"]
    assert logs[0].checked is True


def test_close_trade_computes_checklist_score():
    rule1 = _create_rule(text="Rule 1", tier="must")
    rule2 = _create_rule(text="Rule 2", tier="must")
    trade = _open_trade()
    result = _close_trade(trade["id"], [
        {"rule_id": rule1["id"], "checked": True,  "tier": "must"},
        {"rule_id": rule2["id"], "checked": False, "tier": "must"},
    ])
    assert result["checklist_score"] == 50.0


def test_close_trade_no_checklist_leaves_score_null():
    trade = _open_trade()
    result = _close_trade(trade["id"])  # no checklist_items key
    assert result["checklist_score"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
pytest tests/test_phase6.py -v 2>&1 | head -50
```

Expected: `test_close_trade_computes_checklist_score` FAILS (score None, not 50.0); others may pass or fail.

- [ ] **Step 3: Add `checklist_items` to `TradeClose` and `closed_count` to `TradeResponse` in `backend/schemas.py`**

Replace `TradeClose` (lines 67–71):
```python
class TradeClose(BaseModel):
    exit_price: float
    debrief: str
    checklist_items: list[dict] = []

    model_config = {"str_strip_whitespace": True}
```

Add `closed_count: Optional[int] = None` to `TradeResponse` after line 95 (`trade_date`):
```python
class TradeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    symbol: str
    direction: str
    entry_price: float
    stop_price: float
    target_price: float
    exit_price: Optional[float]
    shares: int
    status: str
    pre_note: str
    debrief: str
    setup_type: Optional[str]
    practice: bool
    checklist_score: Optional[float]
    pnl: Optional[float]
    r_multiple: Optional[float]
    ai_debrief: Optional[str]
    created_at: datetime
    trade_date: Optional[str] = None
    closed_count: Optional[int] = None
```

- [ ] **Step 4: Update `backend/routers/trades.py`**

Add `ChecklistLog` and `PlaybookRule` to the imports at line 7:
```python
from backend.models import Trade, User, ChecklistLog, PlaybookRule
```

Update `_generate_debrief_bg` (lines 15–27) to accept and forward `rule_detail`:
```python
def _generate_debrief_bg(trade_id: int, rule_detail: dict | None = None) -> None:
    db = SessionLocal()
    try:
        trade = db.query(Trade).filter(Trade.id == trade_id).first()
        if not trade or trade.status != "closed" or trade.ai_debrief:
            return
        trade.ai_debrief = claude_service.generate_trade_debrief(trade, rule_detail)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Background debrief failed for trade %s", trade_id)
    finally:
        db.close()
```

Replace `close_trade` endpoint body (lines 108–145) with:
```python
@router.put("/{trade_id}/close", response_model=TradeResponse)
def close_trade(
    trade_id: int,
    body: TradeClose,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trade = db.query(Trade).filter(
        Trade.id == trade_id,
        Trade.user_id == current_user.id,
    ).first()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status == "closed":
        raise HTTPException(400, "Trade is already closed")
    if body.exit_price <= 0:
        raise HTTPException(400, "exit_price must be > 0")
    if not body.debrief.strip():
        raise HTTPException(400, "debrief is required")

    exit_price = body.exit_price
    if trade.direction == "long":
        pnl = (exit_price - trade.entry) * trade.shares
        r_multiple = (exit_price - trade.entry) / (trade.entry - trade.stop)
    else:
        pnl = (trade.entry - exit_price) * trade.shares
        r_multiple = (trade.entry - exit_price) / (trade.stop - trade.entry)

    trade.exit = exit_price
    trade.debrief = body.debrief
    trade.pnl = round(pnl, 2)
    trade.r_multiple = round(r_multiple, 4)
    trade.status = "closed"

    rule_detail = None
    if body.checklist_items:
        rule_ids = [item["rule_id"] for item in body.checklist_items]
        rule_map = {
            r.id: r.text
            for r in db.query(PlaybookRule).filter(PlaybookRule.id.in_(rule_ids)).all()
        }
        for item in body.checklist_items:
            db.add(ChecklistLog(
                user_id=trade.user_id,
                trade_id=trade.id,
                rule_id=item["rule_id"],
                checked=item["checked"],
                tier=item["tier"],
            ))
        scoreable = [i for i in body.checklist_items if i["tier"] in ("must", "should")]
        if scoreable:
            checked_count = sum(1 for i in scoreable if i["checked"])
            trade.checklist_score = round(checked_count / len(scoreable) * 100, 1)
        followed = [rule_map[i["rule_id"]] for i in body.checklist_items if i["checked"] and i["rule_id"] in rule_map]
        violated = [rule_map[i["rule_id"]] for i in body.checklist_items if not i["checked"] and i["rule_id"] in rule_map]
        rule_detail = {"followed": followed, "violated": violated}

    db.commit()
    db.refresh(trade)

    closed_count = db.query(Trade).filter(
        Trade.user_id == trade.user_id,
        Trade.status == "closed",
        Trade.practice == False,
    ).count()

    background_tasks.add_task(_generate_debrief_bg, trade.id, rule_detail)

    response = _to_response(trade)
    response["closed_count"] = closed_count
    return response
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_phase6.py::test_close_trade_writes_checklist_logs tests/test_phase6.py::test_close_trade_computes_checklist_score tests/test_phase6.py::test_close_trade_no_checklist_leaves_score_null -v
```

Expected: all 3 PASS.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
pytest --tb=short -q
```

Expected: all previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add backend/schemas.py backend/routers/trades.py tests/test_phase6.py
git commit -m "feat: wire checklist into trade close — write ChecklistLog, compute score, return closed_count"
```

---

## Task 2: Backend — generate_trade_debrief with rule_detail

**Files:**
- Modify: `backend/services/claude.py:64-92`

- [ ] **Step 1: Update `generate_trade_debrief` signature and prompt in `backend/services/claude.py`**

Replace lines 64–92:
```python
def generate_trade_debrief(trade, rule_detail: dict | None = None) -> str:
    if not _api_key:
        return "[AI debrief unavailable — set ANTHROPIC_API_KEY to enable]"
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)

    followed_str = ", ".join(rule_detail["followed"]) if rule_detail and rule_detail.get("followed") else "none recorded"
    violated_str = ", ".join(rule_detail["violated"]) if rule_detail and rule_detail.get("violated") else "none recorded"

    prompt = f"""You are a professional swing trading coach. Analyze this trade and write a concise debrief.

Trade:
- Symbol: {trade.symbol} | Direction: {trade.direction}
- Entry: ${trade.entry} | Stop: ${trade.stop} | Target: ${trade.target} | Exit: ${trade.exit}
- Shares: {trade.shares} | P&L: ${trade.pnl:.2f} ({trade.r_multiple:.2f}R)
- Setup type: {trade.setup_type or 'Not specified'}
- Plan adherence score: {f"{trade.checklist_score:.0f}%" if trade.checklist_score is not None else "N/A"}
- Rules followed: {followed_str}
- Rules violated: {violated_str}
- Pre-trade note: {trade.pre_note or 'None'}

Write exactly 4 short paragraphs:
1. Plan adherence — did the trade match the pre-trade note and checklist?
2. Entry quality — was entry precise and well-timed?
3. Risk management — was the stop structural, sized correctly, and honoured?
4. Key lesson — one specific, actionable observation from this trade.

Be direct and specific. No generic advice."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text
```

- [ ] **Step 2: Verify the manual re-trigger endpoint still works**

The `generate_ai_debrief` endpoint at line 148 of `trades.py` calls `claude_service.generate_trade_debrief(trade)`. Since `rule_detail` now has a default of `None`, this remains valid — no change needed.

- [ ] **Step 3: Run test suite**

```bash
pytest --tb=short -q
```

Expected: all tests pass (debrief function change is not tested — it requires a live API key).

- [ ] **Step 4: Commit**

```bash
git add backend/services/claude.py
git commit -m "feat: include playbook rules followed/violated in AI debrief prompt"
```

---

## Task 3: Backend — /progress/setups endpoint + tests

**Files:**
- Modify: `backend/routers/progress.py` (append after line 160)
- Modify: `tests/test_phase6.py` (append 3 tests)

- [ ] **Step 1: Write failing tests — append to `tests/test_phase6.py`**

```python
def test_setup_stats_groups_by_setup_type():
    # 2 breakout trades: 1 win (exit 110), 1 loss (exit 90). 1 pullback win.
    for exit_price in [110.0, 90.0]:
        t = _open_trade(setup_type="breakout")
        _close_trade(t["id"])  # uses exit_price=110 helper but we need different prices
    # Redo with explicit prices since _close_trade hardcodes 110:
    # use a different helper for this test
    db = _Session()
    db.close()

    t1 = client.post("/trades/", json={**OPEN_TRADE, "setup_type": "breakout"}).json()
    client.put(f"/trades/{t1['id']}/close", json={"exit_price": 110.0, "debrief": "win"})
    t2 = client.post("/trades/", json={**OPEN_TRADE, "setup_type": "breakout"}).json()
    client.put(f"/trades/{t2['id']}/close", json={"exit_price": 90.0, "debrief": "loss"})
    t3 = client.post("/trades/", json={**OPEN_TRADE, "setup_type": "pullback"}).json()
    client.put(f"/trades/{t3['id']}/close", json={"exit_price": 110.0, "debrief": "win"})

    r = client.get("/progress/setups")
    assert r.status_code == 200
    data = r.json()
    setups = {s["setup_type"]: s for s in data}
    assert "breakout" in setups
    assert "pullback" in setups
    assert setups["breakout"]["trades"] == 2
    assert setups["breakout"]["wins"] == 1
    assert setups["breakout"]["win_rate"] == 50.0
    assert setups["pullback"]["trades"] == 1
    assert setups["pullback"]["wins"] == 1
    assert setups["pullback"]["win_rate"] == 100.0


def test_setup_stats_excludes_practice():
    t1 = client.post("/trades/", json={**OPEN_TRADE, "setup_type": "breakout"}).json()
    client.put(f"/trades/{t1['id']}/close", json={"exit_price": 110.0, "debrief": "x"})
    t2 = client.post("/trades/", json={**OPEN_TRADE, "setup_type": "breakout", "practice": True}).json()
    client.put(f"/trades/{t2['id']}/close", json={"exit_price": 110.0, "debrief": "x"})

    r = client.get("/progress/setups")
    data = {s["setup_type"]: s for s in r.json()}
    assert data["breakout"]["trades"] == 1


def test_setup_stats_excludes_null_setup_type():
    t = client.post("/trades/", json={**{k: v for k, v in OPEN_TRADE.items() if k != "setup_type"}}).json()
    client.put(f"/trades/{t['id']}/close", json={"exit_price": 110.0, "debrief": "x"})

    r = client.get("/progress/setups")
    assert r.status_code == 200
    assert r.json() == []
```

Note: `test_setup_stats_groups_by_setup_type` contains a dead `db = _Session(); db.close()` block from an earlier draft — remove those 2 lines, keeping only the `t1/t2/t3` setup and assertions.

Clean version of that test:
```python
def test_setup_stats_groups_by_setup_type():
    t1 = client.post("/trades/", json={**OPEN_TRADE, "setup_type": "breakout"}).json()
    client.put(f"/trades/{t1['id']}/close", json={"exit_price": 110.0, "debrief": "win"})
    t2 = client.post("/trades/", json={**OPEN_TRADE, "setup_type": "breakout"}).json()
    client.put(f"/trades/{t2['id']}/close", json={"exit_price": 90.0, "debrief": "loss"})
    t3 = client.post("/trades/", json={**OPEN_TRADE, "setup_type": "pullback"}).json()
    client.put(f"/trades/{t3['id']}/close", json={"exit_price": 110.0, "debrief": "win"})

    r = client.get("/progress/setups")
    assert r.status_code == 200
    data = {s["setup_type"]: s for s in r.json()}
    assert data["breakout"]["trades"] == 2
    assert data["breakout"]["wins"] == 1
    assert data["breakout"]["win_rate"] == 50.0
    assert data["pullback"]["trades"] == 1
    assert data["pullback"]["wins"] == 1
    assert data["pullback"]["win_rate"] == 100.0
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
pytest tests/test_phase6.py::test_setup_stats_groups_by_setup_type tests/test_phase6.py::test_setup_stats_excludes_practice tests/test_phase6.py::test_setup_stats_excludes_null_setup_type -v
```

Expected: all 3 FAIL with 404 (endpoint does not exist yet).

- [ ] **Step 3: Add the endpoint to `backend/routers/progress.py`**

Append after the last line of the file (after line 160):

```python


@router.get("/setups")
def get_setup_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from collections import defaultdict
    trades = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.status == "closed",
        Trade.practice == False,
        Trade.setup_type != None,
        Trade.setup_type != "",
    ).all()

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

- [ ] **Step 4: Run new tests to verify they pass**

```bash
pytest tests/test_phase6.py::test_setup_stats_groups_by_setup_type tests/test_phase6.py::test_setup_stats_excludes_practice tests/test_phase6.py::test_setup_stats_excludes_null_setup_type -v
```

Expected: all 3 PASS.

- [ ] **Step 5: Run full test suite**

```bash
pytest --tb=short -q
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/progress.py tests/test_phase6.py
git commit -m "feat: add /progress/setups endpoint for per-setup win rate analytics"
```

---

## Task 4: Frontend — api.js + Progress.jsx By Setup table

**Files:**
- Modify: `frontend/src/api.js:46-50`
- Modify: `frontend/src/pages/Progress.jsx`

- [ ] **Step 1: Add `setups` to `api.progress` in `frontend/src/api.js`**

Replace lines 46–50:
```javascript
  progress: {
    stats:    () => request('GET', '/progress/stats'),
    patterns: () => request('GET', '/progress/patterns'),
    analyze:  () => request('POST', '/progress/analyze-patterns'),
    setups:   () => request('GET', '/progress/setups'),
  },
```

- [ ] **Step 2: Update `frontend/src/pages/Progress.jsx`**

Add `setups` state after the existing state declarations (after line 32):
```javascript
const [setups, setSetups] = useState([])
```

Update the `useEffect` Promise.all to also fetch setups (replace lines 34–44):
```javascript
  useEffect(() => {
    Promise.all([
      api.progress.stats(),
      api.users.skills(user.id),
      api.progress.patterns(),
      api.progress.setups(),
    ]).then(([s, sk, pd, su]) => {
      setStats(s)
      setSkills(sk)
      setPatternData(pd)
      setSetups(su)
    }).catch(err => { console.error('Progress load failed:', err) }).finally(() => setLoading(false))
  }, [user.id])
```

Add the "By Setup" section inside the returned JSX, after the closing `</div>` of the AI Pattern Analysis section and before the Summary section (after line 179):

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

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js frontend/src/pages/Progress.jsx
git commit -m "feat: per-setup win rate analytics on Progress page"
```

---

## Task 5: Frontend — TradeDrawer close-mode checklist + prefill prop

**Files:**
- Modify: `frontend/src/components/TradeDrawer.jsx`

- [ ] **Step 1: Add `useNavigate` import and accept `prefill` prop**

Replace line 1–2 (imports):
```javascript
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
```

Replace line 7 (function signature):
```javascript
export default function TradeDrawer({ mode, trade, onSubmit, onClose, prefill }) {
```

Add `const navigate = useNavigate()` after the `const [checked, setChecked] = useState({})` line (after line 26):
```javascript
  const navigate = useNavigate()
```

- [ ] **Step 2: Add close-mode rules useEffect**

Add a new useEffect after the existing second useEffect (after line 39, before the third useEffect that handles close form reset):
```javascript
  useEffect(() => {
    if (mode !== 'close') return
    if (!trade?.setup_type) { setRules([]); setChecked({}); return }
    api.playbook.rules(trade.setup_type)
      .then(r => {
        setRules(r)
        setChecked(Object.fromEntries(r.map(rule => [rule.id, false])))
      })
      .catch(() => {})
  }, [mode, trade])
```

- [ ] **Step 3: Add prefill useEffect**

Add after the useEffect for close form reset (after line 46):
```javascript
  useEffect(() => {
    if (mode === 'open' && prefill?.symbol) {
      setForm(f => ({ ...f, symbol: prefill.symbol }))
    }
  }, [mode, prefill])
```

- [ ] **Step 4: Include `checklist_items` in the close submit payload**

In `handleSubmit`, replace the close-mode data object (lines 103–106):
```javascript
        : {
            exit_price:      +form.exit_price,
            debrief:         form.debrief.trim(),
            checklist_items: rules
              .filter(r => r.tier !== 'context')
              .map(r => ({ rule_id: r.id, checked: !!checked[r.id], tier: r.tier })),
          }
```

- [ ] **Step 5: Add checklist block in the close-mode JSX section**

In the close-mode form section (before `{field('exit_price', ...)}` — currently at line 289), add the checklist block immediately after the trade summary card:

Replace the close-mode content block starting at line 284:
```jsx
          {mode === 'close' && <>
            <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              <div>{trade?.direction?.toUpperCase()} · Entry ${trade?.entry_price} · {trade?.shares} shares</div>
              <div>Stop ${trade?.stop_price} · Target ${trade?.target_price}</div>
            </div>

            {!trade?.setup_type ? (
              <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                No setup type on this trade.{' '}
                <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => navigate('/playbook')}>
                  Build your playbook →
                </span>
              </div>
            ) : rules.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                No playbook rules for "{trade.setup_type}" yet.{' '}
                <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => navigate('/playbook')}>
                  Add rules →
                </span>
              </div>
            ) : (
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
                  Playbook Checklist — {trade.setup_type}
                </div>
                {['must', 'should', 'context'].map(tier => {
                  const tierRules = rules.filter(r => r.tier === tier)
                  if (tierRules.length === 0) return null
                  return (
                    <div key={tier}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: TIER_COLORS[tier], marginBottom: 4, letterSpacing: '0.06em' }}>
                        {TIER_LABELS[tier]}
                      </div>
                      {tierRules.map(rule => (
                        <label key={rule.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 4 }}>
                          {tier !== 'context' ? (
                            <input
                              type="checkbox"
                              checked={!!checked[rule.id]}
                              onChange={() => toggleRule(rule.id)}
                              style={{ marginTop: 2, flexShrink: 0 }}
                            />
                          ) : (
                            <span style={{ width: 14, height: 14, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>{rule.text}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
                {computeChecklistScore() !== null && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                    Score: <strong style={{ color: 'var(--text)' }}>{computeChecklistScore()}%</strong>
                  </div>
                )}
              </div>
            )}

            {field('exit_price', 'Exit Price', 'number', '930.00')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>
                Debrief <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <textarea
                value={form.debrief}
                onChange={e => set('debrief', e.target.value)}
                rows={4}
                placeholder="What happened? What would you do differently?"
                style={{
                  background: 'var(--surface2)',
                  border: `1px solid ${errors.debrief ? 'var(--red)' : 'var(--border2)'}`,
                  borderRadius: 6, color: 'var(--text)', padding: '7px 10px',
                  fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'var(--font)',
                }}
              />
              {errors.debrief && <span style={{ color: 'var(--red)', fontSize: 11 }}>{errors.debrief}</span>}
            </div>
          </>}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TradeDrawer.jsx
git commit -m "feat: playbook checklist on close side of TradeDrawer, prefill prop"
```

---

## Task 6: Frontend — Watchlist → Journal bridge

**Files:**
- Modify: `frontend/src/pages/Watchlist.jsx`
- Modify: `frontend/src/styles/globals.css` (find `.wl-header` grid)

- [ ] **Step 1: Add `useNavigate` to Watchlist.jsx imports**

Replace line 1–2:
```javascript
import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import ChartModal from '../components/ChartModal'
```

- [ ] **Step 2: Add `navigate` call inside `Watchlist` component**

After `const [tagEditId, setTagEditId] = useState(null)` (after line 79), add:
```javascript
  const navigate = useNavigate()
```

- [ ] **Step 3: Add "Trade →" button to each watchlist row**

Inside the `{items.map(item => ...)}` block, add the Trade button in `.wl-actions` span (replace line 210–211):
```jsx
              <span className="wl-actions">
                <button
                  className="btn-sm btn-ghost"
                  style={{ fontSize: 11 }}
                  onClick={() => navigate('/journal', { state: { prefill: { symbol: item.symbol } } })}
                >
                  Trade →
                </button>
                <button className="btn-sm btn-ghost btn-danger" onClick={() => remove(item.id)}>✕</button>
              </span>
```

- [ ] **Step 4: Add "Action" header column**

In the `.wl-header` div (lines 172–178), add `<span>Action</span>` before the empty `<span />`:
```jsx
          <div className="wl-header">
            <span>Symbol</span>
            <span>Price / Change</span>
            <span>Earnings</span>
            <span>Notes</span>
            <span>Action</span>
            <span />
          </div>
```

- [ ] **Step 5: Update the grid CSS**

Find `.wl-header` in `frontend/src/styles/globals.css`. It will have a `grid-template-columns` value of `90px 180px 90px 1fr 40px`. Change it to:
```css
grid-template-columns: 90px 180px 90px 1fr 80px 40px;
```

Also update `.wl-row` to match the same `grid-template-columns` value if it exists separately.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Watchlist.jsx frontend/src/styles/globals.css
git commit -m "feat: Trade → button on watchlist rows bridges to Journal with symbol prefill"
```

---

## Task 7: Frontend — Journal.jsx — date fix + prefill handling + badge dispatch

**Files:**
- Modify: `frontend/src/pages/Journal.jsx`

- [ ] **Step 1: Add `useLocation` and `useNavigate` imports**

Replace line 1–4:
```javascript
import React, { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import TradeDrawer from '../components/TradeDrawer'
import TradeChart from '../components/TradeChart'
```

- [ ] **Step 2: Add location + prefill state inside Journal component**

After `const [expandedId, setExpandedId] = useState(null)` (after line 28), add:
```javascript
  const location = useLocation()
```

- [ ] **Step 3: Add prefill-on-mount useEffect**

After the `useEffect(() => { loadTrades() }, [loadTrades])` line (after line 41), add:
```javascript
  useEffect(() => {
    if (location.state?.prefill) {
      setDrawer({ mode: 'open', prefill: location.state.prefill })
      window.history.replaceState({}, '')
    }
  }, [])
```

- [ ] **Step 4: Update `handleClose` to capture result and dispatch badge**

Replace `handleClose` (lines 48–51):
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

- [ ] **Step 5: Fix date display — use `trade_date` over `created_at`**

Find line 98:
```javascript
                      {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
```

Replace with:
```javascript
                      {new Date(t.trade_date || t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
```

- [ ] **Step 6: Pass `prefill` prop to TradeDrawer**

Replace the TradeDrawer render (lines 173–180):
```jsx
      {drawer && (
        <TradeDrawer
          mode={drawer.mode}
          trade={drawer.trade}
          prefill={drawer.prefill}
          onSubmit={drawer.mode === 'open' ? handleOpen : handleClose}
          onClose={() => setDrawer(null)}
        />
      )}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Journal.jsx
git commit -m "feat: journal date fix, prefill from watchlist, analysis-badge dispatch on close"
```

---

## Task 8: Frontend — Sidebar analysis-available badge

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Add imports to `frontend/src/components/Sidebar.jsx`**

Replace line 1–2:
```javascript
import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useUser } from '../context/UserContext'
```

- [ ] **Step 2: Add badge state and event listeners inside `Sidebar` component**

After `const { user, users, switchUser } = useUser()` (after line 17), add:
```javascript
  const location = useLocation()
  const [analysisBadge, setAnalysisBadge] = useState(!!sessionStorage.getItem('analysis_available'))

  useEffect(() => {
    const handler = () => setAnalysisBadge(true)
    window.addEventListener('analysis-badge', handler)
    return () => window.removeEventListener('analysis-badge', handler)
  }, [])

  useEffect(() => {
    if (location.pathname === '/progress' && analysisBadge) {
      sessionStorage.removeItem('analysis_available')
      setAnalysisBadge(false)
    }
  }, [location.pathname, analysisBadge])
```

- [ ] **Step 3: Add red dot to Progress NavLink**

Replace the NAV.map render (lines 26–36):
```jsx
      {NAV.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
          {item.to === '/progress' && analysisBadge && (
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--red)', display: 'inline-block',
              marginLeft: 4, verticalAlign: 'middle',
            }} />
          )}
        </NavLink>
      ))}
```

- [ ] **Step 4: Run full test suite one final time**

```bash
pytest --tb=short -q
```

Expected: all tests pass (104+ passing, 0 failures).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.jsx
git commit -m "feat: analysis-available badge dot on Progress nav link"
```

---

## Self-Review

**Spec coverage:**
1. ✅ Playbook checklist at close — Task 1 (backend schema/writes/score) + Task 2 (debrief rule_detail) + Task 5 (frontend checklist JSX)
2. ✅ Per-setup analytics — Task 3 (backend endpoint) + Task 4 (frontend table)
3. ✅ Watchlist → Journal bridge — Task 6 (Watchlist button + CSS) + Task 7 (Journal prefill) + Task 5 (TradeDrawer prefill prop)
4. ✅ Journal date fix — Task 7 step 5
5. ✅ Pattern badge — Task 7 step 4 (dispatch) + Task 8 (Sidebar listener + dot)

**Tests:**
- Task 1: 3 tests (checklist_logs written, score computed, null when empty)
- Task 3: 3 tests (groups by setup, excludes practice, excludes null setup_type)
- Total: 6 new tests in `tests/test_phase6.py`

**Type consistency:**
- `checklist_items` used consistently as `list[dict]` in `TradeClose` and in the frontend `checklist_items` key
- `rule_detail` is `dict | None` throughout (claude.py + trades.py background task)
- `closed_count` added to `TradeResponse` as `Optional[int]`, populated only on close endpoint
- `prefill` prop: `{ symbol: string }` from Watchlist → Journal → TradeDrawer
