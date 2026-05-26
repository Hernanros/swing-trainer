# Phase 4 — AI Pattern Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface recurring behavioral patterns from the user's trade journal via an on-demand Claude analysis button, displayed on the Progress page and Home dashboard.

**Architecture:** A `generate_pattern_analysis(context)` service function calls Claude Haiku with the existing coaching context and returns parsed pattern dicts. Two new router endpoints handle the GET (read current patterns + guard metadata) and POST (guarded analysis trigger). Frontend adds a patterns section to Progress and a teaser card to Home.

**Tech Stack:** FastAPI, SQLAlchemy (SQLite), Pydantic, pytest, React/Vite, Anthropic SDK (Claude Haiku)

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `backend/services/claude.py` | Modify | Add `generate_pattern_analysis(context)` |
| `backend/routers/progress.py` | Modify | Add `GET /patterns` and `POST /analyze-patterns` |
| `tests/test_progress_patterns.py` | Create | 7 tests for both endpoints |
| `frontend/src/api.js` | Modify | Add `api.progress.patterns()` and `api.progress.analyze()` |
| `frontend/src/pages/Progress.jsx` | Modify | Add AI Pattern Analysis section |
| `frontend/src/pages/Home.jsx` | Modify | Add Coaching Insight card |

---

## Task 1: `generate_pattern_analysis` service function

**Files:**
- Modify: `backend/services/claude.py`

No tests for this task — it is tested indirectly via Task 2's mocked router tests. The function is pure Claude I/O and the XML parsing is straightforward.

- [ ] **Step 1: Read `backend/services/claude.py`** to find where to append the new function (after `generate_ask_tip`).

- [ ] **Step 2: Add `generate_pattern_analysis` at the bottom of `backend/services/claude.py`**

```python
def generate_pattern_analysis(context: str) -> list:
    """Call Claude Haiku with coaching context; return list of {severity, pattern_text} dicts.

    Raises RuntimeError if API key missing.
    Raises ValueError if Claude returns unparseable XML or zero valid patterns.
    """
    if not _api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    import xml.etree.ElementTree as ET
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    system = [
        {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": (
            "You are an expert swing trading coach analyzing a student's trade journal. "
            "Be direct and specific. Reference actual numbers from the data."
        )},
    ]
    user_message = (
        "Analyze this trader's journal and identify 3 to 5 recurring behavioral patterns.\n"
        "Return ONLY this XML — no other text:\n\n"
        "<patterns>\n"
        "  <pattern severity=\"problem\">...</pattern>\n"
        "  <pattern severity=\"watch\">...</pattern>\n"
        "  <pattern severity=\"strength\">...</pattern>\n"
        "</patterns>\n\n"
        "Severity rules:\n"
        "- problem: a repeated mistake actively costing edge (cite trade counts)\n"
        "- watch: a tendency worth monitoring that isn't clearly hurting yet\n"
        "- strength: a discipline the trader is consistently getting right\n\n"
        "Each pattern must be one sentence, specific, and cite actual numbers where possible."
    )
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )
    raw = message.content[0].text.strip()
    root = ET.fromstring(raw)
    if root.tag != "patterns":
        raise ValueError(f"Unexpected XML root tag: {root.tag!r}")
    patterns = []
    for elem in root.findall("pattern"):
        severity = elem.get("severity", "").strip()
        text = (elem.text or "").strip()
        if severity in ("problem", "watch", "strength") and text:
            patterns.append({"severity": severity, "pattern_text": text})
    if not patterns:
        raise ValueError("No valid patterns parsed from Claude response")
    return patterns
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add backend/services/claude.py
git commit -m "feat: add generate_pattern_analysis to claude service"
```

---

## Task 2: GET /api/progress/patterns + POST /api/progress/analyze-patterns + tests

**Files:**
- Modify: `backend/routers/progress.py`
- Create: `tests/test_progress_patterns.py`

- [ ] **Step 1: Create `tests/test_progress_patterns.py` with the full test boilerplate and 7 failing tests**

```python
import json
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
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

VALID_TRADE = {
    "symbol": "AAPL",
    "direction": "long",
    "entry_price": 100.0,
    "stop_price": 95.0,
    "target_price": 115.0,
    "shares": 10,
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


def _make_closed_trades(n: int):
    for _ in range(n):
        t = client.post("/api/trades/", json=VALID_TRADE).json()
        client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 110.0, "debrief": "good"})


def _seed_old_pattern(hours_ago: int = 1):
    """Insert an AIPattern with detected_at in the past so new trades are 'after' it."""
    db = _Session()
    from backend.models import AIPattern, User
    user = db.query(User).first()
    db.add(AIPattern(
        user_id=user.id,
        pattern_text="Old pattern",
        severity="problem",
        detected_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
        trade_range="last 20 trades",
    ))
    db.commit()
    db.close()


def _seed_future_pattern():
    """Insert an AIPattern with detected_at 1 hour in the future — all existing trades predate it."""
    db = _Session()
    from backend.models import AIPattern, User
    user = db.query(User).first()
    db.add(AIPattern(
        user_id=user.id,
        pattern_text="Recent pattern",
        severity="watch",
        detected_at=datetime.now(timezone.utc) + timedelta(hours=1),
        trade_range="last 20 trades",
    ))
    db.commit()
    db.close()


FAKE_PATTERNS = [
    {"severity": "problem", "pattern_text": "Cuts winners early in 8 of 12 trades"},
    {"severity": "watch",   "pattern_text": "Overtrading on Mondays"},
    {"severity": "strength","pattern_text": "No stops violated in last 15 trades"},
]


def test_patterns_returns_empty_when_none_exist():
    resp = client.get("/api/progress/patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert data["patterns"] == []
    assert data["last_analyzed_at"] is None
    assert data["min_trades_met"] is False
    assert data["can_analyze"] is False


def test_patterns_returns_existing_patterns():
    _make_closed_trades(5)
    _seed_future_pattern()  # detected 1h in future — all trades predate it
    resp = client.get("/api/progress/patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["patterns"]) == 1
    assert data["patterns"][0]["severity"] == "watch"
    assert data["last_analyzed_at"] is not None
    assert data["min_trades_met"] is True
    assert data["can_analyze"] is False  # no trades after future pattern


def test_analyze_requires_5_trades():
    _make_closed_trades(3)
    resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 422


def test_analyze_requires_new_trade():
    _make_closed_trades(5)
    _seed_future_pattern()  # all existing trades predate it → no new trades
    resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 429


def test_analyze_writes_patterns():
    _make_closed_trades(5)
    with patch("backend.routers.progress.generate_pattern_analysis", return_value=FAKE_PATTERNS):
        resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    assert {p["severity"] for p in data} == {"problem", "watch", "strength"}
    assert all("pattern_text" in p for p in data)
    assert all("detected_at" in p for p in data)


def test_analyze_replaces_old_patterns():
    _make_closed_trades(5)
    _seed_old_pattern(hours_ago=1)  # old pattern in the past — 5 trades are newer
    new_patterns = [{"severity": "strength", "pattern_text": "Improved risk management"}]
    with patch("backend.routers.progress.generate_pattern_analysis", return_value=new_patterns):
        resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["pattern_text"] == "Improved risk management"
    get_resp = client.get("/api/progress/patterns")
    assert len(get_resp.json()["patterns"]) == 1


def test_analyze_returns_503_on_claude_failure():
    _make_closed_trades(5)
    with patch("backend.routers.progress.generate_pattern_analysis",
               side_effect=RuntimeError("API down")):
        resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 503
```

- [ ] **Step 2: Run tests to verify they all FAIL**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/test_progress_patterns.py -v
```

Expected: all 7 FAIL — endpoints don't exist yet (404s) or import errors.

- [ ] **Step 3: Read `backend/routers/progress.py`** to see the current imports and router structure.

- [ ] **Step 4: Rewrite `backend/routers/progress.py`** with the two new endpoints added below the existing `get_stats` endpoint:

```python
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Trade, User, AIPattern
from backend.services.claude import get_user_coaching_context, generate_pattern_analysis

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_trades = db.query(Trade).filter(Trade.user_id == current_user.id).all()
    closed = [t for t in all_trades if t.status == "closed"]

    wins = [t for t in closed if t.pnl is not None and t.pnl >= 0]
    win_rate = round(len(wins) / len(closed) * 100, 1) if closed else None

    r_values = [t.r_multiple for t in closed if t.r_multiple is not None]
    avg_r = round(sum(r_values) / len(r_values), 3) if r_values else None

    scores = [t.checklist_score for t in all_trades if t.checklist_score is not None]
    avg_plan_adherence = round(sum(scores) / len(scores), 1) if scores else None

    total_pnl = round(sum(t.pnl for t in closed if t.pnl is not None), 2)

    return {
        "total_trades":       len(all_trades),
        "closed_trades":      len(closed),
        "wins":               len(wins),
        "win_rate":           win_rate,
        "avg_r":              avg_r,
        "avg_plan_adherence": avg_plan_adherence,
        "total_pnl":          total_pnl,
    }


@router.get("/patterns")
def get_patterns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    patterns = (
        db.query(AIPattern)
        .filter(AIPattern.user_id == current_user.id)
        .order_by(AIPattern.detected_at.desc())
        .all()
    )

    closed_count = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.status == "closed",
    ).count()

    min_trades_met = closed_count >= 5
    last_analyzed_at = None
    can_analyze = min_trades_met

    if patterns:
        last_analyzed_at = max(p.detected_at for p in patterns)
        new_trade_count = db.query(Trade).filter(
            Trade.user_id == current_user.id,
            Trade.status == "closed",
            Trade.created_at > last_analyzed_at,
        ).count()
        can_analyze = min_trades_met and new_trade_count >= 1

    return {
        "patterns": [
            {
                "id": p.id,
                "pattern_text": p.pattern_text,
                "severity": p.severity,
                "detected_at": p.detected_at.isoformat(),
            }
            for p in patterns
        ],
        "last_analyzed_at": last_analyzed_at.isoformat() if last_analyzed_at else None,
        "min_trades_met":   min_trades_met,
        "can_analyze":      can_analyze,
        "trade_range":      "last 20 trades",
    }


@router.post("/analyze-patterns")
def analyze_patterns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    closed_trades = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.status == "closed",
    ).all()

    if len(closed_trades) < 5:
        raise HTTPException(422, "Need at least 5 closed trades to analyze patterns.")

    existing = db.query(AIPattern).filter(AIPattern.user_id == current_user.id).all()
    if existing:
        last_analyzed_at = max(p.detected_at for p in existing)
        new_count = db.query(Trade).filter(
            Trade.user_id == current_user.id,
            Trade.status == "closed",
            Trade.created_at > last_analyzed_at,
        ).count()
        if new_count == 0:
            raise HTTPException(429, "No new trades since last analysis.")

    context = get_user_coaching_context(current_user, db)
    try:
        parsed = generate_pattern_analysis(context)
    except Exception:
        _log.exception("Pattern analysis failed for user %s", current_user.id)
        raise HTTPException(503, "Pattern analysis unavailable — try again later.")

    db.query(AIPattern).filter(AIPattern.user_id == current_user.id).delete()
    now = datetime.now(timezone.utc)
    new_rows = []
    for p in parsed:
        row = AIPattern(
            user_id=current_user.id,
            pattern_text=p["pattern_text"],
            severity=p["severity"],
            detected_at=now,
            trade_range="last 20 trades",
        )
        db.add(row)
        new_rows.append(row)
    db.commit()
    for row in new_rows:
        db.refresh(row)

    return [
        {
            "id": row.id,
            "pattern_text": row.pattern_text,
            "severity": row.severity,
            "detected_at": row.detected_at.isoformat(),
        }
        for row in new_rows
    ]
```

- [ ] **Step 5: Run the 7 new tests — all must PASS**

```bash
python3 -m pytest tests/test_progress_patterns.py -v
```

Expected: 7 passed.

- [ ] **Step 6: Run full suite — must show 99 passed**

```bash
python3 -m pytest -q --no-header 2>&1 | tail -3
```

Expected: 99 passed (92 + 7 new), 0 failed.

- [ ] **Step 7: Commit**

```bash
git add backend/routers/progress.py tests/test_progress_patterns.py
git commit -m "feat: add GET /progress/patterns and POST /progress/analyze-patterns"
```

---

## Task 3: Frontend — api.js + Progress.jsx

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/pages/Progress.jsx`

No automated frontend tests — verify visually after implementation.

- [ ] **Step 1: Read `frontend/src/api.js`** to find the exact `progress:` block (around line 46).

- [ ] **Step 2: Add `patterns` and `analyze` to the `progress` block in `frontend/src/api.js`**

Find:
```js
  progress: {
    stats: () => request('GET', '/progress/stats'),
  },
```

Replace with:
```js
  progress: {
    stats:    () => request('GET', '/progress/stats'),
    patterns: () => request('GET', '/progress/patterns'),
    analyze:  () => request('POST', '/progress/analyze-patterns'),
  },
```

- [ ] **Step 3: Read `frontend/src/pages/Progress.jsx`** in full to find the exact insertion points.

- [ ] **Step 4: Add pattern state and fetch to `Progress.jsx`**

In the `Progress` component, find the existing `useState` declarations:
```js
  const [stats, setStats]     = useState(null)
  const [skills, setSkills]   = useState([])
  const [loading, setLoading] = useState(true)
```

Replace with:
```js
  const [stats, setStats]         = useState(null)
  const [skills, setSkills]       = useState([])
  const [patternData, setPatternData] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeErr, setAnalyzeErr] = useState(null)
  const [loading, setLoading]     = useState(true)
```

Find the existing `useEffect`:
```js
  useEffect(() => {
    Promise.all([
      api.progress.stats(),
      api.users.skills(user.id),
    ]).then(([s, sk]) => {
      setStats(s)
      setSkills(sk)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [user.id])
```

Replace with:
```js
  useEffect(() => {
    Promise.all([
      api.progress.stats(),
      api.users.skills(user.id),
      api.progress.patterns(),
    ]).then(([s, sk, pd]) => {
      setStats(s)
      setSkills(sk)
      setPatternData(pd)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [user.id])
```

- [ ] **Step 5: Add the `handleAnalyze` function inside the `Progress` component**, just before the `return` statement:

```js
  function handleAnalyze() {
    setAnalyzing(true)
    setAnalyzeErr(null)
    api.progress.analyze()
      .then(newPatterns => {
        setPatternData(prev => ({
          ...prev,
          patterns:         newPatterns,
          last_analyzed_at: new Date().toISOString(),
          can_analyze:      false,
        }))
      })
      .catch(() => setAnalyzeErr('Analysis failed — try again'))
      .finally(() => setAnalyzing(false))
  }
```

- [ ] **Step 6: Add the AI Pattern Analysis section to the `Progress` JSX**, after the closing `</div>` of the `skill-bars` section and before the `{stats && (` Summary block:

```jsx
      {/* AI Pattern Analysis */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>AI Pattern Analysis</div>
          {patternData?.min_trades_met && (
            <button
              className="btn-primary"
              style={{ fontSize: 12, padding: '4px 12px' }}
              disabled={!patternData.can_analyze || analyzing}
              title={!patternData.can_analyze ? 'Add a new trade first' : ''}
              onClick={handleAnalyze}
            >
              {analyzing ? 'Analyzing…' : 'Analyze my trading'}
            </button>
          )}
        </div>

        {analyzeErr && (
          <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{analyzeErr}</div>
        )}

        {(!patternData || patternData.patterns.length === 0) && !analyzing && (
          <div style={{ color: 'var(--dim)', fontSize: 13 }}>
            {patternData?.min_trades_met
              ? 'No analysis yet — click "Analyze my trading" to get started.'
              : 'Log at least 5 closed trades to unlock pattern analysis.'}
          </div>
        )}

        {patternData?.patterns.map((p, i) => {
          const color = p.severity === 'problem' ? 'var(--red)'
            : p.severity === 'watch' ? 'var(--yellow)'
            : 'var(--green)'
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{
                background: color,
                color: '#000',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                marginTop: 2,
              }}>
                {p.severity}
              </span>
              <span style={{ color: 'var(--text2)', fontSize: 13 }}>{p.pattern_text}</span>
            </div>
          )
        })}

        {patternData?.last_analyzed_at && (
          <div style={{ color: 'var(--dim)', fontSize: 11, marginTop: 8 }}>
            Last analyzed: {new Date(patternData.last_analyzed_at).toLocaleDateString()} · based on {patternData.trade_range}
          </div>
        )}
      </div>
```

- [ ] **Step 7: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/api.js frontend/src/pages/Progress.jsx
git commit -m "feat: add AI pattern analysis section to Progress page"
```

---

## Task 4: Frontend — Home.jsx Coaching Insight card

**Files:**
- Modify: `frontend/src/pages/Home.jsx`

- [ ] **Step 1: Read `frontend/src/pages/Home.jsx`** in full to find the exact `useState`, `useEffect`, and JSX insertion points.

- [ ] **Step 2: Add `patterns` state to `Home.jsx`**

Find the existing state declarations:
```js
  const [trades, setTrades]    = useState([])
  const [skills, setSkills]    = useState([])
  const [today, setToday]      = useState(null)
```

Add `patterns` state:
```js
  const [trades, setTrades]    = useState([])
  const [skills, setSkills]    = useState([])
  const [today, setToday]      = useState(null)
  const [patterns, setPatterns] = useState([])
```

- [ ] **Step 3: Add patterns fetch to the `useEffect`**

Find:
```js
  useEffect(() => {
    api.trades.list().then(setTrades).catch(() => {})
    api.users.skills(user.id).then(setSkills).catch(() => {})
    api.train.today().then(setToday).catch(() => {})
  }, [user.id])
```

Replace with:
```js
  useEffect(() => {
    api.trades.list().then(setTrades).catch(() => {})
    api.users.skills(user.id).then(setSkills).catch(() => {})
    api.train.today().then(setToday).catch(() => {})
    api.progress.patterns()
      .then(pd => setPatterns(pd.patterns || []))
      .catch(() => {})
  }, [user.id])
```

- [ ] **Step 4: Add the Coaching Insight card to the JSX**

Find the `<DailyTip />` line. Add the Coaching Insight card immediately after it:

```jsx
      <DailyTip />

      {/* Coaching Insight */}
      {(() => {
        const top = patterns.find(p => p.severity === 'problem') || patterns.find(p => p.severity === 'watch')
        if (!top) return null
        const color = top.severity === 'problem' ? 'var(--red)' : 'var(--yellow)'
        return (
          <div style={{ background: 'var(--surface)', border: `1px solid ${color}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                background: color, color: '#000', borderRadius: 4,
                padding: '2px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              }}>
                {top.severity}
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>Coaching Insight</span>
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 8 }}>{top.pattern_text}</div>
            <div
              style={{ color: 'var(--accent)', fontSize: 12, cursor: 'pointer' }}
              onClick={() => navigate('/progress')}
            >
              See full analysis →
            </div>
          </div>
        )
      })()}
```

- [ ] **Step 5: Verify backend tests still pass**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest -q --no-header 2>&1 | tail -3
```

Must show: 99 passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Home.jsx
git commit -m "feat: add Coaching Insight card to Home dashboard"
```

---

## Success Criteria

- [ ] `GET /api/progress/patterns` returns `{ patterns, last_analyzed_at, min_trades_met, can_analyze, trade_range }`
- [ ] `POST /api/progress/analyze-patterns` returns 422 with < 5 closed trades
- [ ] `POST /api/progress/analyze-patterns` returns 429 when no new trades since last run
- [ ] `POST /api/progress/analyze-patterns` writes patterns to DB and returns them
- [ ] Re-running analysis replaces old patterns (old rows deleted before new ones committed)
- [ ] Claude failure returns 503 without touching the DB
- [ ] 99 backend tests pass
- [ ] Progress page shows pattern list with severity pills + analyze button
- [ ] Analyze button hidden when < 5 trades; disabled when no new trades
- [ ] Home dashboard shows top `problem`/`watch` insight card with "See full analysis →" link
