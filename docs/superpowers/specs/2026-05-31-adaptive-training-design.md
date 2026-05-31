# Adaptive Training — Design Spec
_2026-05-31_

## Goal

Questions the user consistently misses come back more often. Each question moves through three mastery states — **new → learning → mastered** — and mastered questions retire from the quiz pool. The user can see their progress per skill on both the Train and Progress pages.

---

## Data Model

New table: `question_mastery`

| column | type | notes |
|---|---|---|
| `id` | Integer PK | |
| `user_id` | Integer FK → users | |
| `skill` | String | e.g. `chart_reading` |
| `bank_idx` | Integer | 0-based index into `DRILL_QUESTIONS[skill]` |
| `state` | String | `new` / `learning` / `mastered` |
| `correct_streak` | Integer | current streak toward mastery (0–3) |
| `updated_at` | DateTime | |

Unique constraint on `(user_id, skill, bank_idx)`.

Questions not present in the table are implicitly `new` with streak 0.

### Mastery transitions

| current state | event | new state | streak |
|---|---|---|---|
| `new` | correct | `learning` | 1 |
| `learning` | correct (streak < 3) | `learning` | streak + 1 |
| `learning` | correct (streak = 2) | `mastered` | 3 |
| `learning` | wrong | `new` | 0 |
| `new` | wrong | `new` | 0 (no-op) |
| `mastered` | — | never shown | — |

---

## Backend

### New endpoint

`GET /api/train/mastery/{skill}`

Returns all `QuestionMastery` rows for the current user + skill:
```json
[{"bank_idx": 3, "state": "learning", "correct_streak": 1}, ...]
```
Empty array if no history (all questions implicitly new). Returns 400 for invalid skill.

### Modified endpoint

`POST /api/train/quiz/submit` — existing behaviour unchanged. Extended: after writing `DrillResult`, loop through `body.detail` and upsert `QuestionMastery` rows for each item that has a `bank_idx` field. Items without `bank_idx` are skipped (backward compatibility).

`detail` item shape (extended):
```json
{"q_idx": 0, "bank_idx": 7, "chosen": 2, "answer": 1, "is_correct": false}
```

### Schema / migration

`Base.metadata.create_all` on startup creates the new table automatically. No migration script needed — same pattern as the rest of the app.

---

## Frontend

### QuizDrill component (`frontend/src/components/drills/QuizDrill.jsx`)

On mount:
1. If `questionsProp` provided (AI drills / custom), use as-is — no mastery fetch.
2. Otherwise fetch `GET /train/mastery/{skill}`.
3. Build a mastery map: `{bank_idx: state}` from the response.
4. Select questions:
   - Collect all `learning` questions from the bank (by bank_idx).
   - Fill remaining slots with `new` questions (bank_idx not in mastery map, or state = `new`).
   - Never include `mastered` questions.
   - Take up to 5 total; if fewer than 5 non-mastered remain, show however many exist.
5. If 0 non-mastered questions remain, render "Skill complete — all questions mastered" instead of a quiz.

Each selected question object carries its `bank_idx`. Answer records include `bank_idx`:
```js
{q_idx: idx, bank_idx: q.bank_idx, chosen: i, answer: q.correct, is_correct: i === q.correct}
```

### Train page (`frontend/src/pages/Train.jsx`)

Each skill card gets a compact mastery bar below the drill button showing three segments:
- mastered count (filled)
- learning count (half-filled)
- new count (empty)

e.g. `■■■■ 4 mastered · ◐◐ 2 learning · □□□□□□□□□ 9 new`

Data source: same `GET /train/mastery/{skill}` call, one per skill on page load.

When mastered count equals total questions for a skill, the drill button changes to a "Complete ✓" state (disabled, different style).

### Progress page (`frontend/src/pages/Progress.jsx`)

New "Question Mastery" section below the existing By Setup table. Shows all 8 skills in a table:
- skill name
- progress bar (mastered / learning / new segments)
- counts: `X mastered, Y learning, Z new`

Data source: call `GET /train/mastery/{skill}` for each skill in parallel on page load, or a single new `GET /train/mastery/all` endpoint that returns all skills at once (avoids 8 serial requests).

> Decision needed at implementation time: single `/all` endpoint vs. 8 parallel frontend calls. Either works; `/all` is cleaner.

---

## Testing

- `GET /train/mastery/{skill}` returns empty array with no history
- `GET /train/mastery/{skill}` returns correct states after quiz submissions
- Mastery transitions: new→learning on correct, learning→mastered at streak 3, drop on wrong
- Quiz submit with no `bank_idx` in detail does not create mastery rows (backward compat)
- Invalid skill returns 400
- QuizDrill: learning questions selected before new ones
- QuizDrill: mastered questions never appear
- QuizDrill: "complete" message when all questions mastered
- Train page: mastery bar renders correct counts
- Progress page: mastery section renders all 8 skills

---

## Out of scope

- Mastered questions are permanently retired (no periodic re-testing / true spaced repetition intervals)
- No per-question history log (only current state matters)
- No way to reset mastery manually (can be added later)
