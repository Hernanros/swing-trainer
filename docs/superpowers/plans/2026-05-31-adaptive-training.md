# Adaptive Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track per-question mastery (new → learning → mastered) across quiz sessions so questions the user misses appear more often and mastered questions retire from the pool.

**Architecture:** A new `QuestionMastery` DB table stores one row per (user, drill_key, bank_idx). The `POST /train/quiz/submit` endpoint upserts mastery rows after every quiz. A new `GET /train/mastery/{drill_key}` endpoint feeds the QuizDrill component, which selects learning-first then new questions and skips mastered ones. Train and Progress pages show per-drill mastery bars.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + Vite (frontend), SQLite (Railway). No new dependencies.

> **Spec amendment:** The design spec says the mastery table column is `skill`. This plan uses `drill_key` instead. Reason: four drills (`chart_reading`, `chart_patterns`, `support_resistance`, `channels`) share `skill='chart_reading'` but have independent question banks — tracking by skill would conflate them. `drill_key` maps 1-to-1 with a question bank.

---

## File Map

| File | Change |
|---|---|
| `backend/models.py` | Add `QuestionMastery` model + User relationship |
| `backend/schemas.py` | Add `VALID_DRILL_KEYS` list |
| `backend/routers/train.py` | Add `_apply_mastery_transition`, `_upsert_mastery`, `GET /mastery/all`, `GET /mastery/{drill_key}`, extend `QuizSubmit` + `submit_quiz` |
| `frontend/src/api.js` | Add `train.getMastery(drillKey)`, `train.getAllMastery()` |
| `frontend/src/components/drills/QuizDrill.jsx` | Mastery-aware question selection, `bank_idx` in answers, `drill_key` in submit |
| `frontend/src/pages/Train.jsx` | Mastery bars per drill row, Complete state |
| `frontend/src/pages/Progress.jsx` | Question Mastery section |
| `frontend/src/styles/globals.css` | Add `.mastery-bar-track` CSS |
| `tests/test_train.py` | Mastery model, endpoint, and transition tests |

---

## Task 1: Add `QuestionMastery` model and `VALID_DRILL_KEYS`

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/schemas.py`
- Test: `tests/test_train.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_train.py` (below the existing imports, add the model import; add the test at the bottom of the file):

```python
from backend.models import User, SkillScore, QuestionMastery  # add QuestionMastery

def test_question_mastery_model_defaults():
    db = _Session()
    row = QuestionMastery(user_id=1, drill_key='entry_timing', bank_idx=3)
    db.add(row)
    db.commit()
    db.refresh(row)
    assert row.state == 'new'
    assert row.correct_streak == 0
    assert row.drill_key == 'entry_timing'
    assert row.bank_idx == 3
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/test_train.py::test_question_mastery_model_defaults -v
```

Expected: `ImportError` — `QuestionMastery` does not exist.

- [ ] **Step 3: Add `VALID_DRILL_KEYS` to `backend/schemas.py`**

Add after the `VALID_SKILLS` block (line 13):

```python
VALID_DRILL_KEYS = [
    "setup_selection",
    "entry_timing",
    "trade_management",
    "emotional_discipline",
    "chart_reading",
    "chart_patterns",
    "support_resistance",
    "channels",
]
```

- [ ] **Step 4: Add `QuestionMastery` model to `backend/models.py`**

Add this import at the top of the imports block (the `UniqueConstraint` is needed):

```python
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey,
    UniqueConstraint,
)
```

Add the model at the end of the file:

```python
class QuestionMastery(Base):
    __tablename__ = "question_mastery"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    drill_key = Column(String, nullable=False)
    bank_idx = Column(Integer, nullable=False)
    state = Column(String, default='new')         # new | learning | mastered
    correct_streak = Column(Integer, default=0)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="question_mastery")

    __table_args__ = (UniqueConstraint('user_id', 'drill_key', 'bank_idx'),)
```

Add relationship to `User` class (after the `tips` relationship on line 27):

```python
    question_mastery = relationship("QuestionMastery", back_populates="user", cascade="all, delete-orphan")
```

- [ ] **Step 5: Run test to verify it passes**

```bash
python3 -m pytest tests/test_train.py::test_question_mastery_model_defaults -v
```

Expected: `PASSED`

- [ ] **Step 6: Run full suite to check for regressions**

```bash
python3 -m pytest tests/ -q
```

Expected: all existing tests pass (110 total).

- [ ] **Step 7: Commit**

```bash
git add backend/models.py backend/schemas.py tests/test_train.py
git commit -m "feat: add QuestionMastery model and VALID_DRILL_KEYS"
```

---

## Task 2: Mastery transition logic and `GET /train/mastery/{drill_key}`

**Files:**
- Modify: `backend/routers/train.py`
- Test: `tests/test_train.py`

- [ ] **Step 1: Write failing tests for the transition helper**

Add to `tests/test_train.py`:

```python
from backend.routers.train import _apply_mastery_transition

def test_transition_new_correct_becomes_learning():
    state, streak = _apply_mastery_transition('new', 0, True)
    assert state == 'learning'
    assert streak == 1

def test_transition_learning_correct_increments_streak():
    state, streak = _apply_mastery_transition('learning', 1, True)
    assert state == 'learning'
    assert streak == 2

def test_transition_learning_streak_2_correct_becomes_mastered():
    state, streak = _apply_mastery_transition('learning', 2, True)
    assert state == 'mastered'
    assert streak == 3

def test_transition_learning_wrong_becomes_new():
    state, streak = _apply_mastery_transition('learning', 1, False)
    assert state == 'new'
    assert streak == 0

def test_transition_new_wrong_stays_new():
    state, streak = _apply_mastery_transition('new', 0, False)
    assert state == 'new'
    assert streak == 0
```

- [ ] **Step 2: Write failing tests for the GET endpoint**

Add to `tests/test_train.py`:

```python
def test_get_mastery_empty_with_no_history():
    resp = client.get("/api/train/mastery/entry_timing")
    assert resp.status_code == 200
    assert resp.json() == []

def test_get_mastery_invalid_drill_key_returns_400():
    resp = client.get("/api/train/mastery/not_a_drill")
    assert resp.status_code == 400
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
python3 -m pytest tests/test_train.py::test_transition_new_correct_becomes_learning tests/test_train.py::test_get_mastery_empty_with_no_history -v
```

Expected: `ImportError` on `_apply_mastery_transition`, `404` on the endpoint.

- [ ] **Step 4: Add the transition helper and endpoint to `backend/routers/train.py`**

Add the import at the top (after existing imports):

```python
from backend.models import User, DrillResult, SkillScore, QuestionMastery
from backend.schemas import RiskCalcSubmit, DRILLS_PER_DAY, VALID_SKILLS, VALID_DRILL_KEYS
```

Add the helper function after `_update_skill_score` (before the first `@router` decorator):

```python
def _apply_mastery_transition(state: str, streak: int, is_correct: bool) -> tuple[str, int]:
    if is_correct:
        if state == 'new':
            return 'learning', 1
        if state == 'learning':
            new_streak = streak + 1
            return ('mastered', 3) if new_streak >= 3 else ('learning', new_streak)
        return state, streak  # mastered: shouldn't be shown, handle gracefully
    else:
        if state == 'learning':
            return 'new', 0
        return state, streak  # new stays new; mastered shouldn't appear
```

Add the two mastery GET endpoints **before** `@router.post("/quiz/submit")`. Register `/mastery/all` first so FastAPI doesn't treat the string "all" as a `{drill_key}` value:

```python
@router.get("/mastery/all")
def get_all_mastery(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(QuestionMastery)
        .filter(QuestionMastery.user_id == current_user.id)
        .all()
    )
    result: dict[str, list] = {}
    for r in rows:
        result.setdefault(r.drill_key, []).append(
            {"bank_idx": r.bank_idx, "state": r.state, "correct_streak": r.correct_streak}
        )
    return result


@router.get("/mastery/{drill_key}")
def get_mastery(
    drill_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if drill_key not in VALID_DRILL_KEYS:
        raise HTTPException(400, f"invalid drill_key: {drill_key}")
    rows = (
        db.query(QuestionMastery)
        .filter(
            QuestionMastery.user_id == current_user.id,
            QuestionMastery.drill_key == drill_key,
        )
        .all()
    )
    return [{"bank_idx": r.bank_idx, "state": r.state, "correct_streak": r.correct_streak} for r in rows]
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
python3 -m pytest tests/test_train.py::test_transition_new_correct_becomes_learning tests/test_train.py::test_transition_learning_correct_increments_streak tests/test_train.py::test_transition_learning_streak_2_correct_becomes_mastered tests/test_train.py::test_transition_learning_wrong_becomes_new tests/test_train.py::test_transition_new_wrong_stays_new tests/test_train.py::test_get_mastery_empty_with_no_history tests/test_train.py::test_get_mastery_invalid_drill_key_returns_400 -v
```

Expected: all 7 `PASSED`.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/train.py tests/test_train.py
git commit -m "feat: add mastery transition logic and GET /train/mastery endpoints"
```

---

## Task 3: Extend quiz submit to upsert mastery rows

**Files:**
- Modify: `backend/routers/train.py`
- Test: `tests/test_train.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_train.py`:

```python
def test_submit_quiz_with_drill_key_creates_mastery_rows():
    detail = [
        {"q_idx": 0, "bank_idx": 0, "chosen": 1, "answer": 0, "is_correct": False},
        {"q_idx": 1, "bank_idx": 2, "chosen": 2, "answer": 2, "is_correct": True},
    ]
    resp = client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing",
        "drill_type": "quiz",
        "score": 50.0,
        "detail": detail,
        "drill_key": "entry_timing",
    })
    assert resp.status_code == 200

    mastery = client.get("/api/train/mastery/entry_timing").json()
    by_idx = {r["bank_idx"]: r for r in mastery}

    # bank_idx 0 was wrong: new (no-op, stays new but row exists)
    assert by_idx[0]["state"] == "new"
    assert by_idx[0]["correct_streak"] == 0

    # bank_idx 2 was correct: new -> learning
    assert by_idx[2]["state"] == "learning"
    assert by_idx[2]["correct_streak"] == 1


def test_mastery_advances_to_mastered_after_three_corrects():
    for _ in range(3):
        client.post("/api/train/quiz/submit", json={
            "skill": "entry_timing",
            "drill_type": "quiz",
            "score": 100.0,
            "detail": [{"q_idx": 0, "bank_idx": 5, "chosen": 0, "answer": 0, "is_correct": True}],
            "drill_key": "entry_timing",
        })

    mastery = client.get("/api/train/mastery/entry_timing").json()
    row = next(r for r in mastery if r["bank_idx"] == 5)
    assert row["state"] == "mastered"
    assert row["correct_streak"] == 3


def test_mastery_drops_on_wrong_answer():
    # Advance to learning first
    client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing", "drill_type": "quiz", "score": 100.0,
        "detail": [{"q_idx": 0, "bank_idx": 7, "chosen": 0, "answer": 0, "is_correct": True}],
        "drill_key": "entry_timing",
    })
    # Now answer wrong
    client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing", "drill_type": "quiz", "score": 0.0,
        "detail": [{"q_idx": 0, "bank_idx": 7, "chosen": 1, "answer": 0, "is_correct": False}],
        "drill_key": "entry_timing",
    })

    mastery = client.get("/api/train/mastery/entry_timing").json()
    row = next(r for r in mastery if r["bank_idx"] == 7)
    assert row["state"] == "new"
    assert row["correct_streak"] == 0


def test_submit_without_drill_key_creates_no_mastery_rows():
    detail = [{"q_idx": 0, "bank_idx": 0, "chosen": 0, "answer": 0, "is_correct": True}]
    client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing", "drill_type": "quiz", "score": 100.0, "detail": detail,
    })
    mastery = client.get("/api/train/mastery/entry_timing").json()
    assert mastery == []


def test_submit_detail_without_bank_idx_is_skipped():
    detail = [{"q_idx": 0, "chosen": 0, "answer": 0, "is_correct": True}]
    client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing", "drill_type": "quiz", "score": 100.0,
        "detail": detail, "drill_key": "entry_timing",
    })
    mastery = client.get("/api/train/mastery/entry_timing").json()
    assert mastery == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python3 -m pytest tests/test_train.py::test_submit_quiz_with_drill_key_creates_mastery_rows tests/test_train.py::test_mastery_advances_to_mastered_after_three_corrects -v
```

Expected: both `FAILED` — no mastery rows are created yet.

- [ ] **Step 3: Add `_upsert_mastery` helper and extend `QuizSubmit` + `submit_quiz`**

In `backend/routers/train.py`, update `QuizSubmit` to add the optional `drill_key` field:

```python
class QuizSubmit(_BaseModel):
    skill: str
    drill_type: str
    score: float
    detail: list = []
    drill_key: str | None = None
```

Add `_upsert_mastery` helper after `_apply_mastery_transition`:

```python
def _upsert_mastery(user_id: int, drill_key: str, detail: list, db: Session) -> None:
    for item in detail:
        bidx = item.get("bank_idx")
        if bidx is None:
            continue
        is_correct = bool(item.get("is_correct"))
        row = (
            db.query(QuestionMastery)
            .filter(
                QuestionMastery.user_id == user_id,
                QuestionMastery.drill_key == drill_key,
                QuestionMastery.bank_idx == bidx,
            )
            .first()
        )
        if row is None:
            row = QuestionMastery(
                user_id=user_id, drill_key=drill_key, bank_idx=bidx,
                state='new', correct_streak=0,
            )
            db.add(row)
        row.state, row.correct_streak = _apply_mastery_transition(
            row.state, row.correct_streak, is_correct
        )
    db.commit()
```

In `submit_quiz`, add the mastery upsert call after `_update_skill_score`:

```python
@router.post("/quiz/submit")
def submit_quiz(
    body: QuizSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.skill not in VALID_SKILLS:
        raise HTTPException(400, f"invalid skill: {body.skill}")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    db.add(DrillResult(
        user_id=current_user.id,
        drill_type=body.drill_type,
        skill=body.skill,
        score=body.score,
        date=today,
        detail_json=json.dumps(body.detail) if body.detail else None,
    ))
    db.commit()
    _update_skill_score(current_user.id, body.skill, db)
    if body.drill_key and body.drill_key in VALID_DRILL_KEYS:
        _upsert_mastery(current_user.id, body.drill_key, body.detail, db)
    return {"score": body.score}
```

- [ ] **Step 4: Run all mastery tests**

```bash
python3 -m pytest tests/test_train.py::test_submit_quiz_with_drill_key_creates_mastery_rows tests/test_train.py::test_mastery_advances_to_mastered_after_three_corrects tests/test_train.py::test_mastery_drops_on_wrong_answer tests/test_train.py::test_submit_without_drill_key_creates_no_mastery_rows tests/test_train.py::test_submit_detail_without_bank_idx_is_skipped -v
```

Expected: all 5 `PASSED`.

- [ ] **Step 5: Run full suite**

```bash
python3 -m pytest tests/ -q
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/train.py tests/test_train.py
git commit -m "feat: upsert QuestionMastery rows on quiz submit"
```

---

## Task 4: Test `GET /train/mastery/all`

**Files:**
- Test: `tests/test_train.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_train.py`:

```python
def test_get_all_mastery_returns_by_drill_key():
    # Submit for two different drill keys
    client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing", "drill_type": "quiz", "score": 100.0,
        "detail": [{"q_idx": 0, "bank_idx": 1, "chosen": 0, "answer": 0, "is_correct": True}],
        "drill_key": "entry_timing",
    })
    client.post("/api/train/quiz/submit", json={
        "skill": "chart_reading", "drill_type": "pattern_quiz", "score": 100.0,
        "detail": [{"q_idx": 0, "bank_idx": 0, "chosen": 0, "answer": 0, "is_correct": True}],
        "drill_key": "chart_patterns",
    })

    resp = client.get("/api/train/mastery/all")
    assert resp.status_code == 200
    data = resp.json()
    assert "entry_timing" in data
    assert "chart_patterns" in data
    assert data["entry_timing"][0]["bank_idx"] == 1
    assert data["chart_patterns"][0]["bank_idx"] == 0

def test_get_all_mastery_empty_with_no_history():
    resp = client.get("/api/train/mastery/all")
    assert resp.status_code == 200
    assert resp.json() == {}
```

- [ ] **Step 2: Run tests to verify they pass (endpoint already exists from Task 2)**

```bash
python3 -m pytest tests/test_train.py::test_get_all_mastery_returns_by_drill_key tests/test_train.py::test_get_all_mastery_empty_with_no_history -v
```

Expected: both `PASSED` — the `/mastery/all` endpoint was added in Task 2.

- [ ] **Step 3: Commit**

```bash
git add tests/test_train.py
git commit -m "test: add coverage for GET /train/mastery/all"
```

---

## Task 5: Frontend — API client and `QuizDrill` mastery-aware selection

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/drills/QuizDrill.jsx`

- [ ] **Step 1: Add mastery calls to `frontend/src/api.js`**

In the `train` object, add two lines after `aiDrill`:

```js
  train: {
    today:           ()         => request('GET',  '/train/today'),
    generateRisk:    ()         => request('GET',  '/train/risk-calc/generate'),
    submitRisk:      (body)     => request('POST', '/train/risk-calc/submit', body),
    submitQuiz:      (body)     => request('POST', '/train/quiz/submit', body),
    aiDrill:         (body)     => request('POST', '/train/ai-drill', body),
    getMastery:      (drillKey) => request('GET',  `/train/mastery/${encodeURIComponent(drillKey)}`),
    getAllMastery:    ()         => request('GET',  '/train/mastery/all'),
  },
```

- [ ] **Step 2: Rewrite `frontend/src/components/drills/QuizDrill.jsx`**

Replace the entire file with:

```jsx
import React, { useState, useEffect } from 'react'
import { api } from '../../api'
import { DRILL_QUESTIONS } from '../../data/drillQuestions'
import DrillChart from '../DrillChart'

function selectQuestions(bank, masteryRecords) {
  const masteryMap = {}
  for (const r of masteryRecords) {
    masteryMap[r.bank_idx] = r.state
  }
  const learning = []
  const newQ = []
  bank.forEach((q, i) => {
    const state = masteryMap[i] ?? 'new'
    if (state === 'mastered') return
    const item = { ...q, bank_idx: i }
    if (state === 'learning') learning.push(item)
    else newQ.push(item)
  })
  return [...learning, ...newQ].slice(0, 5)
}

export default function QuizDrill({ skill, drillKey, drillType, onComplete, questions: questionsProp }) {
  const [questions, setQuestions] = useState(null)
  const [allMastered, setAllMastered] = useState(false)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [answers, setAnswers] = useState([])

  useEffect(() => {
    async function init() {
      if (questionsProp && questionsProp.length > 0) {
        setQuestions(questionsProp)
        return
      }
      const bank = DRILL_QUESTIONS[drillKey] || DRILL_QUESTIONS[skill] || []
      if (bank.length === 0) { setQuestions([]); return }

      let masteryRecords = []
      try {
        masteryRecords = await api.train.getMastery(drillKey)
      } catch (_) {
        // network error — treat all questions as new
      }

      const selected = selectQuestions(bank, masteryRecords)
      if (selected.length === 0) {
        setAllMastered(true)
      }
      setQuestions(selected)
    }
    init()
  }, [skill, drillKey, questionsProp])

  const q = questions?.[idx]

  async function handleSelect(i) {
    if (answered) return
    setSelected(i)
    setAnswered(true)
    if (i === q.correct) setScore(s => s + 1)
    setAnswers(prev => [
      ...prev,
      { q_idx: idx, bank_idx: q.bank_idx ?? null, chosen: i, answer: q.correct, is_correct: i === q.correct },
    ])
  }

  async function next() {
    if (idx < questions.length - 1) {
      setIdx(i => i + 1)
      setSelected(null)
      setAnswered(false)
    } else {
      const finalScore = ((score + (selected === q.correct ? 1 : 0)) / questions.length) * 100
      setSubmitting(true)
      try {
        if (skill !== 'custom') {
          await api.train.submitQuiz({
            skill,
            drill_type: drillType,
            score: finalScore,
            detail: answers,
            drill_key: drillKey ?? null,
          })
        }
      } finally {
        setSubmitting(false)
        setDone(true)
      }
    }
  }

  if (allMastered) {
    return (
      <div className="drill-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2em', marginBottom: 8 }}>✓</div>
        <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>All questions mastered</div>
        <div style={{ color: 'var(--text2)', fontSize: '0.9em', marginBottom: 16 }}>
          You've mastered every question in this drill.
        </div>
        <button className="btn-primary" onClick={onComplete}>Back to drills</button>
      </div>
    )
  }

  if (!questions) {
    return <div className="drill-card" style={{ color: 'var(--muted)', textAlign: 'center' }}>Loading…</div>
  }

  if (done) {
    const finalScore = Math.round((score / questions.length) * 100)
    return (
      <div className="drill-card">
        <div className={`drill-result ${finalScore >= 60 ? 'pass' : 'fail'}`}>
          <div className="drill-result-score">{finalScore}%</div>
          <div className="drill-result-detail">
            {score} of {questions.length} correct
          </div>
        </div>
        <button className="btn-primary" onClick={onComplete}>
          {finalScore === 100 ? 'Perfect — next drill ›' : 'Try another ›'}
        </button>
      </div>
    )
  }

  return (
    <div className="drill-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>{q && skill.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</h3>
        <span style={{ fontSize: '0.8em', color: 'var(--muted)' }}>
          {idx + 1} / {questions.length}
        </span>
      </div>

      {q.chartKey && <DrillChart chartKey={q.chartKey} />}
      <p style={{ fontSize: '0.9em', color: 'var(--text2)', lineHeight: 1.5 }}>{q.q}</p>

      <div className="quiz-options">
        {q.options.map((opt, i) => {
          let cls = 'quiz-option'
          if (answered) {
            if (i === q.correct) cls += ' quiz-option-correct'
            else if (i === selected) cls += ' quiz-option-wrong'
            else cls += ' quiz-option-dim'
          }
          return (
            <button key={i} className={cls} onClick={() => handleSelect(i)} disabled={answered}>
              <span className="quiz-option-letter">{String.fromCharCode(65 + i)}</span>
              {opt}
            </button>
          )
        })}
      </div>

      {answered && (
        <div className="drill-explanation">
          <div className="drill-explanation-title">
            {selected === q.correct ? '✓ Correct' : '✗ Incorrect'}
          </div>
          <p style={{ fontSize: '0.88em', color: 'var(--text2)', lineHeight: 1.55 }}>
            {q.explanation}
          </p>
        </div>
      )}

      {answered && (
        <button className="btn-primary" onClick={next} disabled={submitting}>
          {idx < questions.length - 1 ? 'Next question ›' : submitting ? 'Saving…' : 'See results ›'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build frontend to check for compile errors**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -10
```

Expected: `✓ built` with no errors.

- [ ] **Step 4: Start dev server and manually test the quiz flow**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && uvicorn backend.main:app --reload --port 8000 &
cd frontend && npm run dev
```

Open `http://localhost:5173`, navigate to Train, start a drill. Verify:
- Quiz loads (brief "Loading…" then questions appear)
- Completing a quiz and re-starting the same drill shows the same questions are still available (first session — no mastery yet)
- No console errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.js frontend/src/components/drills/QuizDrill.jsx
git commit -m "feat: mastery-aware question selection in QuizDrill"
```

---

## Task 6: Train page mastery bars

**Files:**
- Modify: `frontend/src/pages/Train.jsx`
- Modify: `frontend/src/styles/globals.css`

- [ ] **Step 1: Add `.mastery-bar-track` to `frontend/src/styles/globals.css`**

Add after the `.drill-list-skill` rule (around line 167):

```css
.mastery-bar-track { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; display: flex; margin-top: 6px; }
```

- [ ] **Step 2: Update `frontend/src/pages/Train.jsx`**

Replace the entire file with:

```jsx
import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { api } from '../api'
import RiskCalcDrill from '../components/drills/RiskCalcDrill'
import QuizDrill from '../components/drills/QuizDrill'
import { DRILL_META, DRILL_QUESTIONS } from '../data/drillQuestions'

function MasteryBar({ drillKey, masteryByKey }) {
  const total = DRILL_QUESTIONS[drillKey]?.length
  if (!total) return null
  const records = masteryByKey[drillKey] || []
  const mastered = records.filter(r => r.state === 'mastered').length
  const learning = records.filter(r => r.state === 'learning').length
  const masteredPct = (mastered / total) * 100
  const learningPct = (learning / total) * 100
  return (
    <div>
      <div className="mastery-bar-track">
        <div style={{ width: `${masteredPct}%`, background: 'var(--green)', height: '100%' }} />
        <div style={{ width: `${learningPct}%`, background: 'var(--yellow)', height: '100%' }} />
      </div>
      <div style={{ fontSize: '0.72em', color: 'var(--muted)', marginTop: 3 }}>
        {mastered} mastered · {learning} learning · {total - mastered - learning} new
      </div>
    </div>
  )
}

export default function Train() {
  const { user } = useUser()
  const [today, setToday] = useState(null)
  const [activeDrill, setActiveDrill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [masteryByKey, setMasteryByKey] = useState({})

  const loadToday = useCallback(() => {
    api.train.today().then(data => {
      setToday(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => { loadToday() }, [loadToday])
  useEffect(() => {
    api.train.getAllMastery().then(setMasteryByKey).catch(() => {})
  }, [])

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

  function drillComplete() {
    setActiveDrill(null)
    loadToday()
    api.train.getAllMastery().then(setMasteryByKey).catch(() => {})
  }

  if (loading) return <div className="loading">Loading…</div>

  const pct = today.drills_assigned > 0
    ? Math.min((today.drills_completed / today.drills_assigned) * 100, 100)
    : 0
  const dailyDone = today.remaining === 0

  const availableDrills = Object.entries(DRILL_META).filter(([key]) =>
    user.active_skills.includes(DRILL_META[key].skill)
  )

  if (activeDrill) {
    const meta = DRILL_META[activeDrill]
    return (
      <div className="page">
        <button
          className="btn-sm btn-ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setActiveDrill(null)}
        >
          ← Back to drills
        </button>
        {activeDrill === 'risk_sizing'
          ? <RiskCalcDrill onComplete={drillComplete} />
          : <QuizDrill skill={meta.skill} drillKey={activeDrill} drillType={meta.type} onComplete={drillComplete} />
        }
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Train</div>
          <div className="phase-label">
            {today.drills_completed} / {today.drills_assigned} daily drills done
            {dailyDone && ' ✓'}
          </div>
        </div>
      </div>

      <div className="drill-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: 'var(--text2)' }}>
          <span>Today's quota</span>
          <span style={{ color: dailyDone ? 'var(--green)' : 'var(--text2)' }}>
            {today.drills_completed}/{today.drills_assigned}
          </span>
        </div>
        <div className="drill-progress-bar-track">
          <div
            className="drill-progress-bar-fill"
            style={{ width: `${pct}%`, background: dailyDone ? 'var(--green)' : undefined }}
          />
        </div>
      </div>

      <div style={{ fontSize: '0.8em', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        Available Drills — {availableDrills.length} for your active skills
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {availableDrills.map(([key, meta]) => {
          const total = DRILL_QUESTIONS[key]?.length
          const mastered = total
            ? (masteryByKey[key] || []).filter(r => r.state === 'mastered').length
            : 0
          const isComplete = total && mastered >= total
          return (
            <div key={key} className="drill-list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="drill-list-title">{meta.label}</div>
                  <div className="drill-list-skill">{meta.skill.replace(/_/g, ' ')}</div>
                </div>
                {isComplete
                  ? <button className="btn-sm" disabled style={{ color: 'var(--green)', borderColor: 'var(--green)', opacity: 1 }}>Complete ✓</button>
                  : <button className="btn-primary" onClick={() => setActiveDrill(key)}>Practice ›</button>
                }
              </div>
              {total && <MasteryBar drillKey={key} masteryByKey={masteryByKey} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build frontend**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -10
```

Expected: `✓ built` with no errors.

- [ ] **Step 4: Manual test**

With dev server running, open Train page. Verify:
- Each drill row shows a mastery bar (all grey — `0 mastered · 0 learning · N new`)
- Completing a quiz then returning to Train page updates the bar (some questions show as `learning`)
- `risk_sizing` row shows no mastery bar (it has no `DRILL_QUESTIONS` entry)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Train.jsx frontend/src/styles/globals.css
git commit -m "feat: mastery bars on Train page drill rows"
```

---

## Task 7: Progress page Question Mastery section

**Files:**
- Modify: `frontend/src/pages/Progress.jsx`

- [ ] **Step 1: Update `frontend/src/pages/Progress.jsx`**

Add the `DRILL_QUESTIONS` import and `DRILL_KEY_LABELS` constant, add `masteryByKey` state, include `getAllMastery` in the `Promise.all`, and add the mastery section below the By Setup block.

Replace the first two lines of the file with:

```jsx
import React, { useState, useEffect } from 'react'
import { useUser } from '../context/UserContext'
import { api } from '../api'
import { DRILL_QUESTIONS } from '../data/drillQuestions'
```

Add `DRILL_KEY_LABELS` and `DRILL_KEYS` constants after `SKILL_LABELS` (after line 12):

```js
const DRILL_KEY_LABELS = {
  setup_selection:      'Setup Selection',
  entry_timing:         'Entry Timing',
  trade_management:     'Trade Management',
  emotional_discipline: 'Emotional Discipline',
  chart_reading:        'Chart Reading',
  chart_patterns:       'Chart Patterns',
  support_resistance:   'Support & Resistance',
  channels:             'Channels',
}
const DRILL_KEYS = Object.keys(DRILL_KEY_LABELS)
```

Add `masteryByKey` state inside the component (after line 33, after `const [loading, setLoading] = useState(true)`):

```js
  const [masteryByKey, setMasteryByKey] = useState({})
```

Replace the `Promise.all` call to include mastery (the existing `Promise.all` is on lines 36–46):

```js
  useEffect(() => {
    Promise.all([
      api.progress.stats(),
      api.users.skills(user.id),
      api.progress.patterns(),
      api.progress.setups(),
      api.train.getAllMastery(),
    ]).then(([s, sk, pd, su, mb]) => {
      setStats(s)
      setSkills(sk)
      setPatternData(pd)
      setSetups(su)
      setMasteryByKey(mb)
    }).catch(err => { console.error('Progress load failed:', err) }).finally(() => setLoading(false))
  }, [user.id])
```

Add the Question Mastery section in the JSX, after the closing `)}` of the `setups.length > 0` block and before the `stats &&` Summary block:

```jsx
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 14 }}>Question Mastery</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DRILL_KEYS.map(dk => {
            const total = DRILL_QUESTIONS[dk]?.length || 0
            const records = masteryByKey[dk] || []
            const mastered = records.filter(r => r.state === 'mastered').length
            const learning = records.filter(r => r.state === 'learning').length
            const newCount = total - mastered - learning
            const isComplete = mastered >= total
            return (
              <div key={dk} className="skill-bar-row">
                <div className="skill-bar-header">
                  <span className="skill-bar-name">{DRILL_KEY_LABELS[dk]}</span>
                  <span className="skill-bar-score" style={{ color: isComplete ? 'var(--green)' : 'var(--text2)' }}>
                    {isComplete ? 'Complete ✓' : `${mastered}/${total}`}
                  </span>
                </div>
                <div className="mastery-bar-track">
                  <div style={{ width: `${(mastered / total) * 100}%`, background: 'var(--green)', height: '100%' }} />
                  <div style={{ width: `${(learning / total) * 100}%`, background: 'var(--yellow)', height: '100%' }} />
                </div>
                <div style={{ fontSize: '0.75em', color: 'var(--muted)', marginTop: 3 }}>
                  {mastered} mastered · {learning} learning · {newCount} new
                </div>
              </div>
            )
          })}
        </div>
      </div>
```

- [ ] **Step 2: Build frontend**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -10
```

Expected: `✓ built` with no errors.

- [ ] **Step 3: Manual test**

Navigate to Progress page. Verify:
- Question Mastery section appears with 8 rows (one per drill key)
- All bars show as grey initially (`0 mastered · 0 learning · N new` where N is 7 or 15)
- After doing some drills, the bars reflect mastery state

- [ ] **Step 4: Run full test suite**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/ -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Progress.jsx
git commit -m "feat: Question Mastery section on Progress page"
```

---

## Task 8: Build, deploy

- [ ] **Step 1: Build final frontend bundle**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build
```

- [ ] **Step 2: Stage dist and deploy to Railway**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/dist
git commit -m "chore: rebuild frontend dist for adaptive training deploy"
railway up --detach
```

- [ ] **Step 3: Verify on live Railway URL**

Open `https://swing-trainer-production-167e.up.railway.app`, navigate to Train page. Confirm:
- Mastery bars render on drill rows
- Starting a drill loads questions without error
- Progress page shows Question Mastery section
