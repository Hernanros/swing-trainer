# Phase 5 — Fix Broken Connections Design

**Date:** 2026-05-26
**Goal:** Three focused fixes that make existing features accurate and connected: exclude practice trades from stats, add a weakest-skill shortcut on Home, and persist per-question drill results for Phase 6.

---

## Overview

Three independent improvements shipped as one phase:

1. **Practice trade exclusion** — practice trades currently inflate win rate, avg R, PnL, and AI pattern analysis. Filter them out of every aggregate query.
2. **Weakest skill → auto-launch** — Home shows the user's lowest-scoring active skill with a button that jumps straight into a drill for it.
3. **detail_json in DrillResult** — per-question results (chosen answer, correct answer, correctness) are now persisted on every quiz submission, enabling Phase 6's adaptive weighting.

---

## Item 1: Exclude Practice Trades

### Affected files

| File | Change |
|------|--------|
| `backend/routers/progress.py` | Add `Trade.practice == False` filter to all queries |
| `backend/services/claude.py` | Add `Trade.practice == False` to coaching context trade query |

### `backend/routers/progress.py`

Three locations need the filter:

**`get_stats()`** — currently fetches all trades. Change:
```python
all_trades = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.practice == False,
).all()
```

**`get_patterns()` — `closed_count` query:**
```python
closed_count = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.status == "closed",
    Trade.practice == False,
).count()
```

**`analyze_patterns()` — both `closed_count` and `new_count` queries:**
```python
closed_count = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.status == "closed",
    Trade.practice == False,
).count()
# ...
new_count = db.query(Trade).filter(
    Trade.user_id == current_user.id,
    Trade.status == "closed",
    Trade.practice == False,
    Trade.created_at > last_analyzed_at,
).count()
```

### `backend/services/claude.py` — `get_user_coaching_context()`

```python
trades = (
    db.query(Trade)
    .filter(Trade.user_id == user.id, Trade.status == "closed", Trade.practice == False)
    .order_by(Trade.created_at.desc())
    .limit(20)
    .all()
)
```

### Notes

- Practice trades remain visible in the Journal — no change there.
- No schema migration needed; `practice` column already exists.

---

## Item 2: Weakest Skill → Auto-Launch Drill on Home

### Affected files

| File | Change |
|------|--------|
| `frontend/src/pages/Home.jsx` | Compute weakest skill, show "Practice X →" button |
| `frontend/src/pages/Train.jsx` | Read `?skill=` query param on mount, auto-launch matching drill |

### `frontend/src/pages/Home.jsx`

`activeSkillScores` is already computed (line ~89). Derive weakest skill and render a button below the skill bars section:

```js
const weakestSkill = activeSkillScores.length > 0
  ? activeSkillScores.reduce((a, b) => a.score <= b.score ? a : b)
  : null
```

Button (shown only when `weakestSkill` is not null):
```jsx
<button className="btn-sm btn-ghost" onClick={() => navigate(`/train?skill=${weakestSkill.skill}`)}>
  Practice {SKILL_LABEL[weakestSkill.skill] || weakestSkill.skill} →
</button>
```

Placement: directly below the skill bars, above the Coaching Insight card.

### `frontend/src/pages/Train.jsx`

Add `useSearchParams` import from `react-router-dom`. On mount, read `?skill=` param:

```js
const [searchParams] = useSearchParams()

useEffect(() => {
  const skillParam = searchParams.get('skill')
  if (skillParam && !loading) {
    const matches = Object.entries(DRILL_META).filter(
      ([, meta]) => meta.skill === skillParam
    )
    if (matches.length > 0) {
      const [key] = matches[Math.floor(Math.random() * matches.length)]
      setActiveDrill(key)
    }
  }
}, [loading, searchParams])
```

If no drill matches the skill param, falls through to the normal drill list (silent no-op).

---

## Item 3: detail_json in DrillResult

### Affected files

| File | Change |
|------|--------|
| `backend/schemas.py` | Add `detail: list = []` to `QuizSubmit` |
| `backend/routers/train.py` | Serialize `detail` to JSON, store in `DrillResult.detail_json` |
| `frontend/src/components/drills/QuizDrill.jsx` | Collect per-question results, pass to `submitQuiz` |
| `frontend/src/api.js` | Update `submitQuiz` to accept and forward `detail` |

### detail_json format

Stored as a JSON string in `DrillResult.detail_json`. Each element represents one question:
```json
[
  {"q_idx": 0, "chosen": 2, "answer": 1, "is_correct": false},
  {"q_idx": 1, "chosen": 0, "answer": 0, "is_correct": true}
]
```

- `q_idx`: 0-based index of the question in the drill
- `chosen`: index of the option the user selected
- `answer`: index of the correct option (from `q.correct`)
- `is_correct`: `chosen === answer`

### `backend/schemas.py`

```python
class QuizSubmit(_BaseModel):
    skill: str
    drill_type: str
    score: float
    detail: list = []
```

### `backend/routers/train.py` — `submit_quiz`

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

### `frontend/src/components/drills/QuizDrill.jsx`

Track an `answers` array in state (parallel to questions). On each answer:
```js
const [answers, setAnswers] = useState([])

// in handleAnswer:
setAnswers(prev => [...prev, { q_idx: idx, chosen: i, answer: q.correct, is_correct: i === q.correct }])
```

On final submit, pass `detail` to `submitQuiz`:
```js
await api.train.submitQuiz({
  skill,
  drill_type: drillType,
  score: finalScore,
  detail: [...answers, { q_idx: idx, chosen: selected, answer: q.correct, is_correct: selected === q.correct }],
})
```

### `frontend/src/api.js`

`submitQuiz` already calls `request('POST', '/train/quiz/submit', body)` — no change needed since the body is forwarded as-is.

### Notes

- Risk calc drills (`submit_risk_calc`) are unchanged — no per-question detail.
- AI drill submissions go through `submitQuiz` too, so they'll get `detail_json` automatically.
- `detail` is optional (`[]` default) so old clients remain compatible.

---

## Tests

New test file: `tests/test_phase5.py`. Follow the pattern in `tests/test_progress_patterns.py`.

- `test_stats_excludes_practice_trades` — seed one real + one practice closed trade; assert stats count = 1
- `test_patterns_gate_excludes_practice_trades` — seed 4 real + 2 practice closed trades; `can_analyze` should be False (only 4 real)
- `test_analyze_excludes_practice_trades` — seed 3 real + 3 practice closed trades; POST → 422
- `test_quiz_submit_stores_detail_json` — POST to `/train/quiz/submit` with `detail` list; assert `DrillResult.detail_json` parses to matching list
- `test_quiz_submit_without_detail` — POST without `detail`; assert `DrillResult.detail_json` is None

---

## Out of Scope

- Displaying per-question accuracy anywhere in the UI (Phase 6)
- Adaptive question weighting (Phase 6 — needs data to accumulate first)
- Excluding practice trades from the Journal view
- A "remove practice trade" action
