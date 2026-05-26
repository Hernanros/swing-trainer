# Phase 5 — Fix Broken Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three fixes: exclude practice trades from all aggregate stats and AI analysis, persist per-question drill results in `detail_json`, and add a weakest-skill auto-launch shortcut on the Home dashboard.

**Architecture:** Backend changes (filters + schema field) are test-driven. Frontend changes (QuizDrill answer tracking, Home weakest-skill button, Train URL-param auto-launch) are verified manually. All tests live in a new `tests/test_phase5.py` file following the pattern in `tests/test_progress_patterns.py`.

**Tech Stack:** FastAPI, SQLAlchemy (SQLite), Pydantic, pytest, React/Vite, react-router-dom

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `tests/test_phase5.py` | Create | 5 backend tests for practice exclusion + detail_json |
| `backend/routers/progress.py` | Modify | Add `Trade.practice == False` to every Trade query |
| `backend/services/claude.py` | Modify | Add `Trade.practice == False` to coaching context query |
| `backend/routers/train.py` | Modify | `QuizSubmit` gets `detail` field; `submit_quiz` stores `detail_json` |
| `frontend/src/components/drills/QuizDrill.jsx` | Modify | Track per-question answers; pass `detail` to `submitQuiz` |
| `frontend/src/pages/Home.jsx` | Modify | Compute `weakestSkill`; render "Practice X →" button |
| `frontend/src/pages/Train.jsx` | Modify | Read `?skill=` query param; auto-launch matching drill |

---

## Task 1: Exclude Practice Trades from Stats + Pattern Guards + Coaching Context

**Files:**
- Create: `tests/test_phase5.py`
- Modify: `backend/routers/progress.py`
- Modify: `backend/services/claude.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_phase5.py`:

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

REAL_TRADE = {
    "symbol": "AAPL",
    "direction": "long",
    "entry_price": 100.0,
    "stop_price": 95.0,
    "target_price": 115.0,
    "shares": 10,
    "practice": False,
}

PRACTICE_TRADE = {**REAL_TRADE, "practice": True}


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


def _open_and_close(trade_body: dict):
    t = client.post("/api/trades/", json=trade_body).json()
    client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 110.0, "debrief": "ok"})


def test_stats_excludes_practice_trades():
    _open_and_close(REAL_TRADE)
    _open_and_close(PRACTICE_TRADE)
    resp = client.get("/api/progress/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_trades"] == 1
    assert data["closed_trades"] == 1


def test_patterns_gate_excludes_practice_trades():
    # 4 real + 2 practice = only 4 real → min_trades_met should be False
    for _ in range(4):
        _open_and_close(REAL_TRADE)
    for _ in range(2):
        _open_and_close(PRACTICE_TRADE)
    resp = client.get("/api/progress/patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert data["min_trades_met"] is False
    assert data["can_analyze"] is False


def test_analyze_excludes_practice_trades():
    # 3 real + 3 practice = only 3 real → 422
    for _ in range(3):
        _open_and_close(REAL_TRADE)
    for _ in range(3):
        _open_and_close(PRACTICE_TRADE)
    resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/test_phase5.py::test_stats_excludes_practice_trades tests/test_phase5.py::test_patterns_gate_excludes_practice_trades tests/test_phase5.py::test_analyze_excludes_practice_trades -v
```

Expected: all 3 FAIL — stats will count 2 trades, gate will see 6 trades.

- [ ] **Step 3: Fix `backend/routers/progress.py` — `get_stats()`**

Find this block (around line 18):
```python
all_trades = db.query(Trade).filter(Trade.user_id == current_user.id).all()
```

Replace with:
```python
all_trades = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.practice == False,
).all()
```

- [ ] **Step 4: Fix `backend/routers/progress.py` — `get_patterns()` closed_count**

Find (around line 55):
```python
closed_count = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.status == "closed",
).count()
```

Replace with:
```python
closed_count = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.status == "closed",
    Trade.practice == False,
).count()
```

- [ ] **Step 5: Fix `backend/routers/progress.py` — `analyze_patterns()` both queries**

In `analyze_patterns()`, find the first closed_count query (around line 90):
```python
closed_count = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.status == "closed",
).count()
```

Replace with:
```python
closed_count = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.status == "closed",
    Trade.practice == False,
).count()
```

Then find the new_count query (around line 103):
```python
new_count = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.status == "closed",
    Trade.created_at > last_analyzed_at,
).count()
```

Replace with:
```python
new_count = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.status == "closed",
    Trade.practice == False,
    Trade.created_at > last_analyzed_at,
).count()
```

- [ ] **Step 6: Fix `backend/services/claude.py` — `get_user_coaching_context()`**

Find (around line 33):
```python
trades = (
    db.query(Trade)
    .filter(Trade.user_id == user.id, Trade.status == "closed")
    .order_by(Trade.created_at.desc())
    .limit(20)
    .all()
)
```

Replace with:
```python
trades = (
    db.query(Trade)
    .filter(Trade.user_id == user.id, Trade.status == "closed", Trade.practice == False)
    .order_by(Trade.created_at.desc())
    .limit(20)
    .all()
)
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/test_phase5.py::test_stats_excludes_practice_trades tests/test_phase5.py::test_patterns_gate_excludes_practice_trades tests/test_phase5.py::test_analyze_excludes_practice_trades -v
```

Expected: all 3 PASS.

- [ ] **Step 8: Run full suite to check for regressions**

```bash
python3 -m pytest -q --no-header 2>&1 | tail -3
```

Expected: 102 passed (99 + 3 new).

- [ ] **Step 9: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add tests/test_phase5.py backend/routers/progress.py backend/services/claude.py
git commit -m "feat: exclude practice trades from stats, pattern gates, and coaching context"
```

---

## Task 2: detail_json in DrillResult (Backend)

**Files:**
- Modify: `tests/test_phase5.py`
- Modify: `backend/routers/train.py`

- [ ] **Step 1: Add failing tests to `tests/test_phase5.py`**

Append to the bottom of `tests/test_phase5.py`:

```python
def test_quiz_submit_stores_detail_json():
    detail = [
        {"q_idx": 0, "chosen": 1, "answer": 2, "is_correct": False},
        {"q_idx": 1, "chosen": 0, "answer": 0, "is_correct": True},
    ]
    resp = client.post("/api/train/quiz/submit", json={
        "skill": "chart_reading",
        "drill_type": "quiz",
        "score": 50.0,
        "detail": detail,
    })
    assert resp.status_code == 200

    db = _Session()
    from backend.models import DrillResult
    row = db.query(DrillResult).first()
    db.close()
    assert row is not None
    assert row.detail_json is not None
    stored = json.loads(row.detail_json)
    assert stored == detail


def test_quiz_submit_without_detail():
    resp = client.post("/api/train/quiz/submit", json={
        "skill": "chart_reading",
        "drill_type": "quiz",
        "score": 80.0,
    })
    assert resp.status_code == 200

    db = _Session()
    from backend.models import DrillResult
    row = db.query(DrillResult).first()
    db.close()
    assert row is not None
    assert row.detail_json is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/test_phase5.py::test_quiz_submit_stores_detail_json tests/test_phase5.py::test_quiz_submit_without_detail -v
```

Expected: `test_quiz_submit_stores_detail_json` FAILS (detail_json is None); `test_quiz_submit_without_detail` PASSES (already works). That's fine — at least one fails.

- [ ] **Step 3: Add `detail` field to `QuizSubmit` in `backend/routers/train.py`**

Find (around line 13):
```python
class QuizSubmit(_BaseModel):
    skill: str
    drill_type: str
    score: float   # 0 or 100
```

Replace with:
```python
class QuizSubmit(_BaseModel):
    skill: str
    drill_type: str
    score: float   # 0 or 100
    detail: list = []
```

- [ ] **Step 4: Store `detail_json` in `submit_quiz` in `backend/routers/train.py`**

Find (around line 105):
```python
    db.add(DrillResult(
        user_id=current_user.id,
        drill_type=body.drill_type,
        skill=body.skill,
        score=body.score,
        date=today,
    ))
```

Replace with:
```python
    db.add(DrillResult(
        user_id=current_user.id,
        drill_type=body.drill_type,
        skill=body.skill,
        score=body.score,
        date=today,
        detail_json=json.dumps(body.detail) if body.detail else None,
    ))
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/test_phase5.py::test_quiz_submit_stores_detail_json tests/test_phase5.py::test_quiz_submit_without_detail -v
```

Expected: both PASS.

- [ ] **Step 6: Run full suite**

```bash
python3 -m pytest -q --no-header 2>&1 | tail -3
```

Expected: 104 passed (102 + 2 new).

- [ ] **Step 7: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add tests/test_phase5.py backend/routers/train.py
git commit -m "feat: persist per-question detail_json in DrillResult on quiz submit"
```

---

## Task 3: detail_json in QuizDrill (Frontend)

**Files:**
- Modify: `frontend/src/components/drills/QuizDrill.jsx`

No automated tests — verify manually by completing a quiz drill and inspecting the network request.

- [ ] **Step 1: Add `answers` state to `QuizDrill`**

In `frontend/src/components/drills/QuizDrill.jsx`, find the state declarations block (around line 12):
```javascript
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
```

Replace with:
```javascript
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [answers, setAnswers] = useState([])
```

- [ ] **Step 2: Record each answer in `handleSelect`**

Find:
```javascript
  async function handleSelect(i) {
    if (answered) return
    setSelected(i)
    setAnswered(true)
    if (i === q.correct) setScore(s => s + 1)
  }
```

Replace with:
```javascript
  async function handleSelect(i) {
    if (answered) return
    setSelected(i)
    setAnswered(true)
    if (i === q.correct) setScore(s => s + 1)
    setAnswers(prev => [...prev, { q_idx: idx, chosen: i, answer: q.correct, is_correct: i === q.correct }])
  }
```

- [ ] **Step 3: Pass `answers` to `submitQuiz` in `next()`**

Find:
```javascript
        if (skill !== 'custom') {
          await api.train.submitQuiz({ skill, drill_type: drillType, score: finalScore })
        }
```

Replace with:
```javascript
        if (skill !== 'custom') {
          await api.train.submitQuiz({ skill, drill_type: drillType, score: finalScore, detail: answers })
        }
```

- [ ] **Step 4: Manual verification**

Start the dev server:
```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend"
npm run dev
```

1. Log in, go to Train, complete any quiz drill (answer all 5 questions)
2. Open browser DevTools → Network tab → find the `POST /api/train/quiz/submit` request
3. Inspect the request payload — it should contain a `detail` array with 5 objects, each with `q_idx`, `chosen`, `answer`, `is_correct`
4. Check the response is 200

- [ ] **Step 5: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/components/drills/QuizDrill.jsx
git commit -m "feat: track per-question answers in QuizDrill and send detail to backend"
```

---

## Task 4: Weakest Skill → Auto-Launch Drill (Frontend)

**Files:**
- Modify: `frontend/src/pages/Home.jsx`
- Modify: `frontend/src/pages/Train.jsx`

No automated tests — verify manually.

- [ ] **Step 1: Compute `weakestSkill` in `Home.jsx`**

In `frontend/src/pages/Home.jsx`, find (around line 89):
```javascript
  const activeSkillScores = skills.filter(sk => user.active_skills.includes(sk.skill))
```

Add the line immediately after it:
```javascript
  const weakestSkill = activeSkillScores.length > 0
    ? activeSkillScores.reduce((a, b) => a.score <= b.score ? a : b)
    : null
```

- [ ] **Step 2: Add "Practice X →" button below the skill bars in `Home.jsx`**

In `frontend/src/pages/Home.jsx`, find the closing `</div>` of the skill-bars section. The section looks like this (around line 164):
```jsx
        <div className="skill-bars">
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 4 }}>Skill Progress</div>
          {activeSkillScores.length === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>Complete drills to build skill scores.</div>
          ) : (
            activeSkillScores.map(sk => (
              <div className="skill-bar-row" key={sk.skill}>
                <div className="skill-bar-header">
                  <span className="skill-bar-name">{SKILL_LABEL[sk.skill] || sk.skill}</span>
                  <span className="skill-bar-score">{sk.score.toFixed(0)}</span>
                </div>
                <div className="skill-bar-track">
                  <div className="skill-bar-fill" style={{ width: `${sk.score}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
```

Replace with:
```jsx
        <div className="skill-bars">
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 4 }}>Skill Progress</div>
          {activeSkillScores.length === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>Complete drills to build skill scores.</div>
          ) : (
            activeSkillScores.map(sk => (
              <div className="skill-bar-row" key={sk.skill}>
                <div className="skill-bar-header">
                  <span className="skill-bar-name">{SKILL_LABEL[sk.skill] || sk.skill}</span>
                  <span className="skill-bar-score">{sk.score.toFixed(0)}</span>
                </div>
                <div className="skill-bar-track">
                  <div className="skill-bar-fill" style={{ width: `${sk.score}%` }} />
                </div>
              </div>
            ))
          )}
          {weakestSkill && (
            <button
              className="btn-sm btn-ghost"
              style={{ marginTop: 8, alignSelf: 'flex-start' }}
              onClick={() => navigate(`/train?skill=${weakestSkill.skill}`)}
            >
              Practice {SKILL_LABEL[weakestSkill.skill] || weakestSkill.skill} →
            </button>
          )}
        </div>
```

- [ ] **Step 3: Add `useSearchParams` to `Train.jsx` imports**

In `frontend/src/pages/Train.jsx`, find:
```javascript
import React, { useEffect, useState, useCallback } from 'react'
import { useUser } from '../context/UserContext'
```

Replace with:
```javascript
import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUser } from '../context/UserContext'
```

- [ ] **Step 4: Add auto-launch effect to `Train.jsx`**

In `frontend/src/pages/Train.jsx`, find the existing `useEffect` call (around line 21):
```javascript
  useEffect(() => { loadToday() }, [loadToday])
```

Add the following block immediately after it:
```javascript
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (loading) return
    const skillParam = searchParams.get('skill')
    if (!skillParam) return
    const matches = Object.entries(DRILL_META).filter(([, meta]) => meta.skill === skillParam)
    if (matches.length === 0) return
    const [key] = matches[Math.floor(Math.random() * matches.length)]
    setActiveDrill(key)
  }, [loading, searchParams])
```

- [ ] **Step 5: Manual verification**

With the dev server running:

1. Go to Train, complete at least one quiz drill so a `SkillScore` row exists
2. Go to Home — you should see a "Practice [Skill Name] →" button below the skill bars
3. Click it — you should land directly inside a quiz drill for that skill (not the drill list)
4. Click "← Back to drills" to return to the drill list
5. Confirm the button is hidden when no skill scores exist (new account)

- [ ] **Step 6: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/pages/Home.jsx frontend/src/pages/Train.jsx
git commit -m "feat: add weakest-skill practice shortcut on Home with auto-launch in Train"
```

---

## Success Criteria

- [ ] `python3 -m pytest -q --no-header 2>&1 | tail -3` reports 104 passed, 0 failed
- [ ] Progress stats (win rate, avg R, PnL) reflect only non-practice closed trades
- [ ] Pattern analysis requires ≥5 real (non-practice) closed trades
- [ ] Completing a quiz drill sends a `detail` array in the POST payload
- [ ] `DrillResult.detail_json` is stored in the DB (check via tests)
- [ ] Home shows "Practice [skill] →" button when skill scores exist
- [ ] Clicking the button launches a drill for that skill directly
