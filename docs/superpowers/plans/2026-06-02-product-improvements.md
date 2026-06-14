# Product Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four product gaps identified in the product review: pattern-to-practice routing, mastery-aware AI drills, position-size helper in TradeDrawer, and Watchlist→trade setup-type pre-fill.

**Architecture:** All changes are additive. The backend gets one new column (`ai_patterns.skill`), one endpoint upgrade (ai-drill gains a `skill` param), and no new routes. The frontend gets three UI enhancements and one UX shortcut — all within existing components. No new files.

**Tech Stack:** FastAPI + SQLAlchemy (SQLite), React + Vite, existing component + hook patterns.

---

## File Map

| File | Change |
|---|---|
| `backend/models.py` | Add `skill` column to `AIPattern` |
| `backend/main.py` | Add SQLite migration for `ai_patterns.skill` |
| `backend/services/claude.py` | Update XML prompt to request `skill` attribute; parse it |
| `backend/routers/progress.py` | Store `skill` in `AIPattern`; include in both response dicts |
| `backend/routers/train.py` | Add optional `skill` to `AIDrillRequest`; add `db` dep; inject mastery context into prompt |
| `frontend/src/pages/Home.jsx` | Add "Practice →" button on coaching card when `pattern.skill` is set |
| `frontend/src/pages/Progress.jsx` | Import `useNavigate`; add "Practice →" button per pattern |
| `frontend/src/pages/Curriculum.jsx` | Pass `group.skill` to `openDrill`; include in API call |
| `frontend/src/components/TradeDrawer.jsx` | Add `helperAccount`/`helperRisk` state + Size Helper section; handle `prefill.setup_type` |
| `frontend/src/pages/Watchlist.jsx` | Pass `setup_type` (from Setup tags) in prefill navigate calls |
| `tests/test_progress_patterns.py` | Two new tests: skill stored, skill returned in GET |
| `tests/test_train.py` | Two new tests: ai-drill with skill, mastery context in prompt |

---

## Task 1: Pattern-to-practice loop (backend)

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/main.py`
- Modify: `backend/services/claude.py`
- Modify: `backend/routers/progress.py`
- Test: `tests/test_progress_patterns.py`

- [ ] **Step 1: Write two failing tests in `tests/test_progress_patterns.py`**

Add after the existing `FAKE_PATTERNS` constant and before the first test function:

```python
FAKE_PATTERNS_WITH_SKILLS = [
    {"severity": "problem", "pattern_text": "Cuts winners early in 8 of 12 trades", "skill": "trade_management"},
    {"severity": "watch",   "pattern_text": "Overtrading on Mondays", "skill": "emotional_discipline"},
    {"severity": "strength","pattern_text": "No stops violated in last 15 trades", "skill": None},
]


def test_analyze_stores_and_returns_skill():
    _make_closed_trades(5)
    with patch("backend.routers.progress.generate_pattern_analysis",
               return_value=FAKE_PATTERNS_WITH_SKILLS):
        resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["skill"] == "trade_management"
    assert data[1]["skill"] == "emotional_discipline"
    assert data[2]["skill"] is None


def test_get_patterns_includes_skill():
    _make_closed_trades(5)
    with patch("backend.routers.progress.generate_pattern_analysis",
               return_value=FAKE_PATTERNS_WITH_SKILLS):
        client.post("/api/progress/analyze-patterns")
    resp = client.get("/api/progress/patterns")
    assert resp.status_code == 200
    patterns = resp.json()["patterns"]
    assert any(p["skill"] == "trade_management" for p in patterns)
    assert any(p["skill"] is None for p in patterns)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/test_progress_patterns.py::test_analyze_stores_and_returns_skill tests/test_progress_patterns.py::test_get_patterns_includes_skill -v 2>&1 | tail -20
```

Expected: FAIL — `skill` key not in response.

- [ ] **Step 3: Add `skill` column to `AIPattern` in `backend/models.py`**

Find the `AIPattern` class. After the line `trade_range = Column(String, nullable=True)`, add:

```python
    skill = Column(String, nullable=True)
```

The full `AIPattern` class should now end with:
```python
class AIPattern(Base):
    __tablename__ = "ai_patterns"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pattern_text = Column(Text, nullable=False)
    severity = Column(String, nullable=False)        # problem | watch | strength
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    trade_range = Column(String, nullable=True)
    skill = Column(String, nullable=True)

    user = relationship("User", back_populates="ai_patterns")
```

- [ ] **Step 4: Add SQLite migration in `backend/main.py`**

In the `lifespan` function, right before the `yield` line, add:

```python
        ai_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(ai_patterns)"))]
        if "skill" not in ai_cols:
            conn.execute(text("ALTER TABLE ai_patterns ADD COLUMN skill TEXT"))
            conn.commit()
```

- [ ] **Step 5: Update `generate_pattern_analysis` in `backend/services/claude.py`**

Find the `user_message` string in `generate_pattern_analysis`. Replace it with:

```python
    user_message = (
        "Analyze this trader's journal and identify 3 to 5 recurring behavioral patterns.\n"
        "Return ONLY this XML — no other text:\n\n"
        "<patterns>\n"
        "  <pattern severity=\"problem\" skill=\"trade_management\">...</pattern>\n"
        "  <pattern severity=\"watch\" skill=\"emotional_discipline\">...</pattern>\n"
        "  <pattern severity=\"strength\">...</pattern>\n"
        "</patterns>\n\n"
        "Severity rules:\n"
        "- problem: a repeated mistake actively costing edge (cite trade counts)\n"
        "- watch: a tendency worth monitoring that isn't clearly hurting yet\n"
        "- strength: a discipline the trader is consistently getting right\n\n"
        "Skill attribute (optional): set to the single most relevant skill from: "
        "setup_selection, entry_timing, risk_sizing, trade_management, emotional_discipline, chart_reading. "
        "Omit the attribute entirely if the pattern doesn't map cleanly to one skill.\n\n"
        "Each pattern must be one sentence, specific, and cite actual numbers where possible."
    )
```

Then find the parsing loop (the `for elem in root.findall("pattern"):` block) and replace it with:

```python
    patterns = []
    for elem in root.findall("pattern"):
        severity = elem.get("severity", "").strip()
        skill = elem.get("skill", "").strip() or None
        text = (elem.text or "").strip()
        if severity in ("problem", "watch", "strength") and text:
            patterns.append({"severity": severity, "pattern_text": text, "skill": skill})
```

- [ ] **Step 6: Update `backend/routers/progress.py` — store skill, return in both responses**

**Edit 1** — in `get_patterns`, the response dict for each pattern currently is:
```python
            {
                "id": p.id,
                "pattern_text": p.pattern_text,
                "severity": p.severity,
                "detected_at": p.detected_at.isoformat(),
            }
```

Replace with:
```python
            {
                "id": p.id,
                "pattern_text": p.pattern_text,
                "severity": p.severity,
                "skill": p.skill,
                "detected_at": p.detected_at.isoformat(),
            }
```

**Edit 2** — in `analyze_patterns`, find where `AIPattern` rows are created:
```python
        row = AIPattern(
            user_id=current_user.id,
            pattern_text=p["pattern_text"],
            severity=p["severity"],
            detected_at=now,
            trade_range="last 20 trades",
        )
```

Replace with:
```python
        row = AIPattern(
            user_id=current_user.id,
            pattern_text=p["pattern_text"],
            severity=p["severity"],
            skill=p.get("skill"),
            detected_at=now,
            trade_range="last 20 trades",
        )
```

**Edit 3** — in `analyze_patterns`, the final return dict currently is:
```python
        {
            "id": row.id,
            "pattern_text": row.pattern_text,
            "severity": row.severity,
            "detected_at": row.detected_at.isoformat(),
        }
```

Replace with:
```python
        {
            "id": row.id,
            "pattern_text": row.pattern_text,
            "severity": row.severity,
            "skill": row.skill,
            "detected_at": row.detected_at.isoformat(),
        }
```

- [ ] **Step 7: Run the new tests to verify they pass**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/test_progress_patterns.py -v 2>&1 | tail -20
```

Expected: all 7 tests PASS.

- [ ] **Step 8: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add backend/models.py backend/main.py backend/services/claude.py backend/routers/progress.py tests/test_progress_patterns.py && git commit -m "feat: add skill tag to AI pattern analysis for pattern-to-practice routing"
```

---

## Task 2: Pattern-to-practice routing (frontend)

**Files:**
- Modify: `frontend/src/pages/Home.jsx`
- Modify: `frontend/src/pages/Progress.jsx`

- [ ] **Step 1: Add "Practice →" button to Home coaching card**

In `frontend/src/pages/Home.jsx`, find the coaching insight section. It currently ends with:

```jsx
            <div
              style={{ color: 'var(--accent)', fontSize: 12, cursor: 'pointer' }}
              onClick={() => navigate('/progress')}
            >
              See full analysis →
            </div>
```

Replace with:

```jsx
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <div
                style={{ color: 'var(--accent)', fontSize: 12, cursor: 'pointer' }}
                onClick={() => navigate('/progress')}
              >
                See full analysis →
              </div>
              {top.skill && (
                <button
                  className="btn-sm btn-ghost"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={() => navigate(`/train?skill=${encodeURIComponent(top.skill)}`)}
                >
                  Practice {SKILL_LABEL[top.skill] || top.skill.replace(/_/g, ' ')} →
                </button>
              )}
            </div>
```

- [ ] **Step 2: Add `useNavigate` import and "Practice →" buttons to Progress patterns**

In `frontend/src/pages/Progress.jsx`, find the existing import:
```jsx
import React, { useState, useEffect } from 'react'
import { useUser } from '../context/UserContext'
import { api } from '../api'
```

Replace with:
```jsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { api } from '../api'
```

Then inside the `Progress` component, add `const navigate = useNavigate()` right after the state declarations (after `const [loading, setLoading] = useState(true)`):

```jsx
  const navigate = useNavigate()
```

Then find the pattern map block. Currently each pattern renders as:
```jsx
          {(patternData?.patterns ?? []).map((p, i) => {
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
```

Replace with:
```jsx
          {(patternData?.patterns ?? []).map((p, i) => {
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
                <div style={{ flex: 1 }}>
                  <span style={{ color: 'var(--text2)', fontSize: 13 }}>{p.pattern_text}</span>
                  {p.skill && (
                    <div style={{ marginTop: 4 }}>
                      <button
                        className="btn-sm btn-ghost"
                        style={{ fontSize: 11 }}
                        onClick={() => navigate(`/train?skill=${encodeURIComponent(p.skill)}`)}
                      >
                        Practice {SKILL_LABELS[p.skill] || p.skill.replace(/_/g, ' ')} →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
```

- [ ] **Step 3: Build to verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add frontend/src/pages/Home.jsx frontend/src/pages/Progress.jsx && git commit -m "feat: add Practice button on pattern cards linking to relevant drill"
```

---

## Task 3: Mastery-aware AI drill (backend + frontend)

**Files:**
- Modify: `backend/routers/train.py`
- Modify: `frontend/src/pages/Curriculum.jsx`
- Test: `tests/test_train.py`

- [ ] **Step 1: Write two failing tests in `tests/test_train.py`**

Add these imports at the top of the file (after existing imports):
```python
import json
from unittest.mock import patch
```

Add these constants and tests anywhere after the `client = TestClient(app)` line:

```python
_MOCK_AI_QUESTIONS = json.dumps([{
    "q": f"Question {i}?",
    "choices": ["A", "B", "C", "D"],
    "answer": 0,
    "explanation": "Because A."
} for i in range(5)])


def test_ai_drill_with_skill_returns_questions():
    with patch("backend.routers.train.call_claude", return_value=_MOCK_AI_QUESTIONS):
        resp = client.post("/api/train/ai-drill", json={
            "topic": "entry timing",
            "context": "How to time entries precisely",
            "skill": "entry_timing",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "questions" in data
    assert len(data["questions"]) == 5


def test_ai_drill_mastery_context_injected_in_prompt():
    db = _Session()
    user = db.query(User).first()
    db.add(QuestionMastery(user_id=user.id, drill_key="entry_timing", bank_idx=0, state="learning", correct_streak=1))
    db.add(QuestionMastery(user_id=user.id, drill_key="entry_timing", bank_idx=1, state="mastered", correct_streak=3))
    db.commit()
    db.close()

    captured = {}

    def _capture(prompt, max_tokens=1000):
        captured["prompt"] = prompt
        return _MOCK_AI_QUESTIONS

    with patch("backend.routers.train.call_claude", side_effect=_capture):
        resp = client.post("/api/train/ai-drill", json={
            "topic": "entry timing",
            "context": "How to time entries precisely",
            "skill": "entry_timing",
        })
    assert resp.status_code == 200
    assert "mastery" in captured["prompt"].lower()
    assert "entry_timing" in captured["prompt"]
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/test_train.py::test_ai_drill_with_skill_returns_questions tests/test_train.py::test_ai_drill_mastery_context_injected_in_prompt -v 2>&1 | tail -20
```

Expected: FAIL — `skill` field not accepted and mastery not injected.

- [ ] **Step 3: Update `AIDrillRequest` and `generate_ai_drill` in `backend/routers/train.py`**

**Edit 1** — add `Optional` to the `typing` import. The current import is:
```python
from typing import Optional
```
(Already present — no change needed.)

**Edit 2** — find `AIDrillRequest`:
```python
class AIDrillRequest(_BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)
    context: str = Field(..., max_length=1000)
    model_config = {"str_strip_whitespace": True}
```

Replace with:
```python
class AIDrillRequest(_BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)
    context: str = Field(..., max_length=1000)
    skill: Optional[str] = None
    model_config = {"str_strip_whitespace": True}
```

**Edit 3** — find the `generate_ai_drill` function signature:
```python
@router.post("/ai-drill")
def generate_ai_drill(body: AIDrillRequest, current_user: User = Depends(get_current_user)):
```

Replace with:
```python
@router.post("/ai-drill")
def generate_ai_drill(
    body: AIDrillRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
```

**Edit 4** — find the `prompt = f"""You are a swing trading quiz generator.` line inside `generate_ai_drill`. Insert the mastery context block immediately before it:

```python
    mastery_context = ""
    if body.skill and body.skill in VALID_DRILL_KEYS:
        rows = (
            db.query(QuestionMastery)
            .filter(
                QuestionMastery.user_id == current_user.id,
                QuestionMastery.drill_key == body.skill,
            )
            .all()
        )
        if rows:
            new_count = sum(1 for r in rows if r.state == 'new')
            learning_count = sum(1 for r in rows if r.state == 'learning')
            mastered_count = sum(1 for r in rows if r.state == 'mastered')
            mastery_context = (
                f"\n\nStudent mastery for {body.skill}: "
                f"{mastered_count} questions mastered, {learning_count} in progress, {new_count} not yet attempted. "
                "Focus questions on concepts still in progress or not yet attempted — avoid re-testing already-mastered material."
            )

    prompt = f"""You are a swing trading quiz generator.

<topic>{body.topic}</topic>
<context>{body.context}</context>{mastery_context}

Generate exactly 5 multiple-choice quiz questions testing understanding of this specific concept.
Return ONLY a JSON array with this exact shape, no markdown, no explanation:
[
  {{
    "q": "Question text",
    "choices": ["Option A", "Option B", "Option C", "Option D"],
    "answer": 0,
    "explanation": "Why this answer is correct"
  }}
]
The "answer" field is the 0-based index of the correct choice."""
```

- [ ] **Step 4: Update `frontend/src/pages/Curriculum.jsx` to pass `skill`**

Find `openDrill(item)` function definition:
```jsx
  async function openDrill(item) {
    setDrillModal({ topic: item.id, context: item.text })
    setDrillQuestions(null)
    setDrillError('')
    setDrillLoading(true)
    try {
      const { questions } = await api.train.aiDrill({ topic: item.id, context: item.text })
```

Replace with:
```jsx
  async function openDrill(item, skill) {
    setDrillModal({ topic: item.id, context: item.text })
    setDrillQuestions(null)
    setDrillError('')
    setDrillLoading(true)
    try {
      const { questions } = await api.train.aiDrill({ topic: item.id, context: item.text, skill: skill || null })
```

Find all call sites of `openDrill(item)` inside the `group.items.map`. There is one:
```jsx
                    <button
                      className="curr-practice-btn btn-sm btn-ghost"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); openDrill(item) }}
```

Replace with:
```jsx
                    <button
                      className="curr-practice-btn btn-sm btn-ghost"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); openDrill(item, group.skill) }}
```

- [ ] **Step 5: Run tests**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/test_train.py -v 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 6: Build to verify no compile errors**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 7: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add backend/routers/train.py frontend/src/pages/Curriculum.jsx tests/test_train.py && git commit -m "feat: inject mastery context into AI drill prompts for targeted question generation"
```

---

## Task 4: Position size helper in TradeDrawer

**Files:**
- Modify: `frontend/src/components/TradeDrawer.jsx`

- [ ] **Step 1: Add `helperAccount` and `helperRisk` state**

In `frontend/src/components/TradeDrawer.jsx`, find the existing state declarations block (the lines starting with `const [form, setForm]`). After the last `useState` declaration in the block (the `const [checked, setChecked]` line), add:

```jsx
  const [helperAccount, setHelperAccount] = useState('')
  const [helperRisk, setHelperRisk]       = useState('1')
```

- [ ] **Step 2: Add the computed `suggestedShares` value**

Right after the `helperRisk` state line, add:

```jsx
  const suggestedShares = (() => {
    const account = +helperAccount
    const risk    = +helperRisk
    const entry   = +form.entry_price
    const stop    = +form.stop_price
    if (!account || !risk || !entry || !stop || entry === stop) return 0
    return Math.floor((account * risk / 100) / Math.abs(entry - stop))
  })()
```

- [ ] **Step 3: Add the Size Helper UI section**

In the open-trade form (`mode === 'open'`), find the `{field('entry_price', 'Entry Price', 'number', '900.00')}` line. After it (before `{field('shares', ...)}`), insert:

```jsx
            {/* Size Helper */}
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Size Helper <span style={{ fontSize: 10, color: 'var(--dim)' }}>(optional)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Account $</label>
                  <input
                    type="number"
                    value={helperAccount}
                    onChange={e => setHelperAccount(e.target.value)}
                    placeholder="25000"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border2)',
                      borderRadius: 6, color: 'var(--text)', padding: '6px 8px',
                      fontSize: 13, outline: 'none', width: '100%',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Risk %</label>
                  <input
                    type="number"
                    value={helperRisk}
                    onChange={e => setHelperRisk(e.target.value)}
                    placeholder="1"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border2)',
                      borderRadius: 6, color: 'var(--text)', padding: '6px 8px',
                      fontSize: 13, outline: 'none', width: '100%',
                    }}
                  />
                </div>
              </div>
              {suggestedShares > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                    Suggested: <strong style={{ color: 'var(--text)' }}>{suggestedShares} shares</strong>
                  </span>
                  <button
                    type="button"
                    className="btn-sm btn-ghost"
                    style={{ fontSize: 11 }}
                    onClick={() => set('shares', String(suggestedShares))}
                  >
                    Use
                  </button>
                </div>
              )}
            </div>
```

- [ ] **Step 4: Build to verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add frontend/src/components/TradeDrawer.jsx && git commit -m "feat: add position size helper to trade entry form"
```

---

## Task 5: Watchlist → setup type pre-fill

**Files:**
- Modify: `frontend/src/pages/Watchlist.jsx`
- Modify: `frontend/src/components/TradeDrawer.jsx`

- [ ] **Step 1: Add `getSetupType` helper and update navigate calls in `frontend/src/pages/Watchlist.jsx`**

Right after the `TAG_GROUPS` constant definition (after the closing `}` of the object, before `function QuoteCell`), add:

```jsx
function getSetupType(tags) {
  return (tags || []).find(t => TAG_GROUPS.Setup.includes(t)) || null
}
```

Find the desktop "Trade →" button (inside the non-expanded row, around line 214):
```jsx
                  onClick={() => navigate('/journal', { state: { prefill: { symbol: item.symbol } } })}
```

Replace with:
```jsx
                  onClick={() => navigate('/journal', { state: { prefill: { symbol: item.symbol, setup_type: getSetupType(item.tags) } } })}
```

Find the mobile expanded detail "Trade →" button (inside `wl-mobile-detail`, the `navigate` call):
```jsx
                    onClick={e => { e.stopPropagation(); navigate('/journal', { state: { prefill: { symbol: item.symbol } } }) }}
```

Replace with:
```jsx
                    onClick={e => { e.stopPropagation(); navigate('/journal', { state: { prefill: { symbol: item.symbol, setup_type: getSetupType(item.tags) } } }) }}
```

- [ ] **Step 2: Handle `prefill.setup_type` in `frontend/src/components/TradeDrawer.jsx`**

Find the prefill `useEffect` (currently at the end of the effects block):
```jsx
  useEffect(() => {
    if (mode === 'open' && prefill?.symbol) {
      setForm(f => ({ ...f, symbol: prefill.symbol }))
    }
  }, [mode, prefill])
```

Replace with:
```jsx
  useEffect(() => {
    if (mode === 'open' && prefill?.symbol) {
      setForm(f => ({
        ...f,
        symbol: prefill.symbol,
        setup_type: prefill.setup_type || f.setup_type,
      }))
    }
  }, [mode, prefill])
```

- [ ] **Step 3: Build to verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add frontend/src/pages/Watchlist.jsx frontend/src/components/TradeDrawer.jsx && git commit -m "feat: pre-fill setup type from watchlist tags when opening a trade"
```

---

## Task 6: Full test suite + build dist + deploy

- [ ] **Step 1: Run full test suite**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && python -m pytest tests/ -v 2>&1 | tail -30
```

Expected: all tests PASS (125+ tests).

- [ ] **Step 2: Build final frontend bundle**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 3: Commit dist and deploy**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add frontend/dist && git commit -m "chore: rebuild dist for product improvements deploy" && railway up --detach
```
