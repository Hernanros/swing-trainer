# Watchlist Tags, Curriculum YouTube Links, On-Demand AI Drills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tag labels to watchlist items, YouTube search links to curriculum items, and AI-generated on-demand drill questions per curriculum topic.

**Architecture:** Three independent feature slices. Tags extend the existing `WatchlistItem` model with a JSON column. YouTube links are static search query strings added to the curriculum data in the frontend. AI drills add one new backend endpoint that calls the existing `backend/services/claude.py` and renders results in a modal using the existing `QuizDrill` component.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, React, existing `backend/services/claude.py` (Anthropic), `QuizDrill` component at `frontend/src/components/drills/QuizDrill.jsx`

---

## Task 1: Add `tags` column to WatchlistItem model and schema

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/schemas.py`
- Modify: `backend/main.py` (lifespan migration)

- [ ] **Step 1: Add `tags` column to `WatchlistItem` in `backend/models.py`**

```python
# In WatchlistItem class, after the `notes` column:
tags = Column(Text, nullable=False, default='[]')
```

- [ ] **Step 2: Add migration in `backend/main.py` lifespan**

Inside the `with engine.connect() as conn:` block, after the existing column checks:
```python
wl_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(watchlist)"))]
if "tags" not in wl_cols:
    conn.execute(text("ALTER TABLE watchlist ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'"))
    conn.commit()
```

- [ ] **Step 3: Update schemas in `backend/schemas.py`**

```python
# Replace existing watchlist schemas:
class WatchlistItemCreate(BaseModel):
    symbol: str
    notes: str = ""
    tags: List[str] = []
    model_config = {"str_strip_whitespace": True}

class WatchlistItemUpdate(BaseModel):
    notes: str = ""

class WatchlistTagsUpdate(BaseModel):
    tags: List[str]

class WatchlistItemResponse(BaseModel):
    id: int
    symbol: str
    notes: str
    tags: List[str] = []
    added_at: datetime
    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Fix `tags` serialization — `WatchlistItemResponse` needs a validator**

The `tags` column stores JSON text but the schema expects `List[str]`. Add a field validator to `WatchlistItemResponse`:

```python
from pydantic import field_validator
import json

class WatchlistItemResponse(BaseModel):
    id: int
    symbol: str
    notes: str
    tags: List[str] = []
    added_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v or []
```

- [ ] **Step 5: Update `add_to_watchlist` in `backend/routers/watchlist.py` to save tags**

```python
import json as _json

# In add_to_watchlist:
item = WatchlistItem(
    user_id=current_user.id,
    symbol=symbol,
    notes=body.notes,
    tags=_json.dumps(body.tags),
)
```

- [ ] **Step 6: Commit**

```bash
git add backend/models.py backend/schemas.py backend/main.py backend/routers/watchlist.py
git commit -m "feat: add tags column to WatchlistItem model and schema"
```

---

## Task 2: Add `PUT /api/watchlist/{id}/tags` endpoint

**Files:**
- Modify: `backend/routers/watchlist.py`

- [ ] **Step 1: Add the tags endpoint**

```python
import json as _json
from backend.schemas import WatchlistTagsUpdate

@router.put("/{item_id}/tags", response_model=WatchlistItemResponse)
def update_tags(
    item_id: int,
    body: WatchlistTagsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(WatchlistItem).filter(
        WatchlistItem.id == item_id,
        WatchlistItem.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(404, "Item not found")
    item.tags = _json.dumps(body.tags)
    db.commit()
    db.refresh(item)
    return item
```

- [ ] **Step 2: Add `updateTags` to `frontend/src/api.js`**

```javascript
// Inside the watchlist object:
updateTags: (id, tags) => request('PUT', `/watchlist/${id}/tags`, { tags }),
```

- [ ] **Step 3: Commit**

```bash
git add backend/routers/watchlist.py frontend/src/api.js
git commit -m "feat: add PUT /watchlist/{id}/tags endpoint"
```

---

## Task 3: Watchlist tag UI in Watchlist.jsx

**Files:**
- Modify: `frontend/src/pages/Watchlist.jsx`

- [ ] **Step 1: Add tag constants at top of file**

```javascript
const TAG_GROUPS = {
  Setup:    ['VCP', 'Cup & Handle', 'Flat Base', 'Breakout', 'Pullback'],
  Stage:    ['Watching', 'Ready to Buy', 'Passed'],
  Priority: ['High', 'Medium', 'Low'],
}
const ALL_TAGS = Object.values(TAG_GROUPS).flat()
```

- [ ] **Step 2: Add `tagEditId` state and `saveTags` function**

```javascript
const [tagEditId, setTagEditId] = useState(null)

async function saveTags(id, tags) {
  const updated = await api.watchlist.updateTags(id, tags)
  setItems(prev => prev.map(i => i.id === id ? { ...i, tags: updated.tags } : i))
}

function toggleTag(item, tag) {
  const current = item.tags || []
  const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
  saveTags(item.id, next)
  setItems(prev => prev.map(i => i.id === item.id ? { ...i, tags: next } : i))
}
```

- [ ] **Step 3: Add tag row to each watchlist item (inside `items.map`)**

Replace the closing `</div>` of each `wl-row` with:

```jsx
<div className="wl-row" key={item.id}>
  <span className="wl-symbol wl-symbol-link" onClick={() => setChartSymbol(item.symbol)} title="View chart">{item.symbol}</span>
  <QuoteCell symbol={item.symbol} />
  <span className="wl-notes">
    {editId === item.id ? (
      <span className="wl-edit-row">
        <input className="wl-input" value={editNotes} onChange={e => setEditNotes(e.target.value)} autoFocus />
        <button className="btn-sm" onClick={() => saveNotes(item.id)}>Save</button>
        <button className="btn-sm btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
      </span>
    ) : (
      <span className="wl-notes-text" onClick={() => { setEditId(item.id); setEditNotes(item.notes || '') }} title="Click to edit">
        {item.notes || <em className="muted">add notes</em>}
      </span>
    )}
  </span>
  <span className="wl-actions">
    <button className="btn-sm btn-ghost btn-danger" onClick={() => remove(item.id)}>✕</button>
  </span>
  {/* Tag row */}
  <div className="wl-tags-row">
    {(item.tags || []).map(t => (
      <span key={t} className="wl-tag active" onClick={() => toggleTag(item, t)}>{t} ✕</span>
    ))}
    <button className="btn-sm btn-ghost wl-tag-add" onClick={() => setTagEditId(tagEditId === item.id ? null : item.id)}>+ tag</button>
    {tagEditId === item.id && (
      <div className="wl-tag-picker">
        {Object.entries(TAG_GROUPS).map(([group, tags]) => (
          <div key={group} className="wl-tag-group">
            <span className="wl-tag-group-label">{group}</span>
            {tags.map(tag => (
              <span
                key={tag}
                className={`wl-tag ${(item.tags || []).includes(tag) ? 'active' : ''}`}
                onClick={() => toggleTag(item, tag)}
              >{tag}</span>
            ))}
          </div>
        ))}
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 4: Add tag styles to the existing CSS file**

Find `frontend/src/index.css` (or equivalent) and add:

```css
.wl-tags-row { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0 8px 0; grid-column: 1 / -1; }
.wl-tag { padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; cursor: pointer; border: 1px solid var(--border); color: var(--muted); }
.wl-tag.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.wl-tag-add { font-size: 0.72rem; }
.wl-tag-picker { position: absolute; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 10px; z-index: 10; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.3); }
.wl-tag-group { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.wl-tag-group-label { font-size: 0.68rem; color: var(--muted); width: 60px; }
.wl-row { position: relative; }
```

- [ ] **Step 5: Rebuild frontend dist**

```bash
cd frontend && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Watchlist.jsx frontend/src/index.css frontend/dist
git commit -m "feat: add tag UI to watchlist items"
```

---

## Task 4: Add YouTube search links to Curriculum

**Files:**
- Modify: `frontend/src/pages/Curriculum.jsx`

- [ ] **Step 1: Add `ytQuery` to every curriculum item**

Replace the `CURRICULUM` array in `Curriculum.jsx` with this (adds `ytQuery` to each item):

```javascript
const CURRICULUM = [
  {
    skill: 'setup_selection', label: 'Setup Selection',
    items: [
      { id: 'ss_1', text: 'Understand the 3 core base patterns: cup-with-handle, flat base, VCP (volatility contraction)', ytQuery: 'cup with handle flat base VCP volatility contraction pattern swing trading tutorial' },
      { id: 'ss_2', text: 'Identify relative strength vs the S&P 500 using the RS line on a weekly chart', ytQuery: 'relative strength line IBD stock market swing trading tutorial' },
      { id: 'ss_3', text: 'Confirm breakout with volume: 40%+ above average on the breakout day', ytQuery: 'breakout volume confirmation swing trading 40 percent above average' },
      { id: 'ss_4', text: 'Filter for Stage 2 uptrends: price above 50-day and 200-day moving averages, both sloping up', ytQuery: 'stage 2 uptrend 50 day 200 day moving average swing trading' },
      { id: 'ss_5', text: 'Focus on leading sectors — trade the top 1-2 leaders, ignore laggards', ytQuery: 'leading sectors IBD swing trading sector rotation' },
    ],
  },
  {
    skill: 'entry_timing', label: 'Entry Timing',
    items: [
      { id: 'et_1', text: 'Define the exact pivot point before entry: high of handle or top of tight base', ytQuery: 'pivot point breakout entry swing trading handle base' },
      { id: 'et_2', text: 'Buy at or within 5% of the pivot — never chase extended entries', ytQuery: 'buying within 5 percent pivot swing trading rules extended entry' },
      { id: 'et_3', text: 'Use the 10-minute or 15-minute chart to time intraday entries precisely', ytQuery: '10 minute 15 minute chart intraday entry timing swing trading' },
      { id: 'et_4', text: 'Confirm market direction with a follow-through day (FTD) before entering new positions', ytQuery: 'follow through day FTD market bottom IBD confirmation' },
      { id: 'et_5', text: 'Avoid buying into overhead resistance — check for prior distribution areas on the weekly chart', ytQuery: 'overhead resistance weekly chart swing trading distribution' },
    ],
  },
  {
    skill: 'risk_sizing', label: 'Risk Sizing',
    items: [
      { id: 'rs_1', text: 'Position size formula: shares = (account × risk%) ÷ (entry − stop)', ytQuery: 'position sizing formula risk management trading shares calculation' },
      { id: 'rs_2', text: 'Set initial stop at 7–8% below entry or structurally below the base low', ytQuery: 'stop loss placement 7 8 percent swing trading base low' },
      { id: 'rs_3', text: 'Never risk more than 1–2% of total account on any single trade', ytQuery: '1 percent 2 percent account risk per trade position sizing rule' },
      { id: 'rs_4', text: 'Track total portfolio heat: sum of all open risk should stay below 6–8% of account', ytQuery: 'portfolio heat total open risk management swing trading' },
      { id: 'rs_5', text: 'Pyramiding rule: buy 50% at pivot, add 25% on first pullback to 10-day MA, rest if extended', ytQuery: 'pyramiding into position swing trading 10 day moving average add' },
    ],
  },
  {
    skill: 'trade_management', label: 'Trade Management',
    items: [
      { id: 'tm_1', text: 'Cut losses automatically at 7–8% below purchase price — no exceptions, no averaging down', ytQuery: 'cut losses 7 8 percent stop loss discipline trading no exceptions' },
      { id: 'tm_2', text: 'Take partial profits (25–30% of position) once the stock is up 20–25%', ytQuery: 'taking partial profits 20 25 percent swing trading sell rules' },
      { id: 'tm_3', text: 'Apply the 8-week hold rule: if a stock surges 20%+ in 3 weeks, hold for 8 weeks total', ytQuery: '8 week hold rule 20 percent surge 3 weeks swing trading IBD' },
      { id: 'tm_4', text: 'Raise stop to breakeven once the trade is profitable by 1R', ytQuery: 'raise stop to breakeven 1R risk reward trade management' },
      { id: 'tm_5', text: 'Recognize sell signals: climax run, gap-up to new high on volume after a long advance', ytQuery: 'climax run sell signals gap up volume extended swing trading' },
    ],
  },
  {
    skill: 'emotional_discipline', label: 'Emotional Discipline',
    items: [
      { id: 'ed_1', text: 'Write a pre-trade note before every entry: setup rationale, stop, target, risk $', ytQuery: 'pre trade journal note trading discipline setup rationale' },
      { id: 'ed_2', text: 'Never average down on a losing position — adding to a loser compounds risk', ytQuery: 'never average down losing position trading psychology risk' },
      { id: 'ed_3', text: 'Rule of 3: stop trading for the day after 3 consecutive losses', ytQuery: 'daily loss limit rule of 3 consecutive losses trading discipline' },
      { id: 'ed_4', text: 'Conduct a weekly review: go through every trade — what worked, what failed, and why', ytQuery: 'weekly trade review journal analysis what worked failed trading' },
      { id: 'ed_5', text: 'Assess market conditions every morning before trading (uptrend / correction / distribution)', ytQuery: 'morning market conditions assessment IBD uptrend distribution trading routine' },
    ],
  },
  {
    skill: 'chart_reading', label: 'Chart Reading',
    items: [
      { id: 'cr_1', text: 'Read volume patterns: rising price + rising volume = accumulation (bullish signal)', ytQuery: 'volume price action accumulation distribution chart reading bullish' },
      { id: 'cr_2', text: 'Use the 50-day MA as dynamic support — healthy stocks bounce off it, weak ones slice through', ytQuery: '50 day moving average dynamic support swing trading bounce' },
      { id: 'cr_3', text: 'Count distribution days on the index: 5–6 in a few weeks often signals a market top', ytQuery: 'distribution days count market top index IBD swing trading' },
      { id: 'cr_4', text: 'Spot tight price action: weeks of very small ranges = institutional accumulation in progress', ytQuery: 'tight price action VCP institutional accumulation small range chart' },
      { id: 'cr_5', text: 'Use the weekly chart as primary timeframe for setup identification; daily for entry precision', ytQuery: 'weekly chart daily chart timeframe swing trading setup identification entry' },
    ],
  },
]
```

- [ ] **Step 2: Add YouTube button to each curriculum item**

In the `items.map` render, add a YouTube link after the checkbox label:

```jsx
{group.items.map(item => (
  <label key={item.id} className={`curr-item${checked.has(item.id) ? ' checked' : ''}`}>
    <input
      type="checkbox"
      className="curr-checkbox"
      checked={checked.has(item.id)}
      onChange={() => toggle(item.id)}
    />
    <span className="curr-item-text">{item.text}</span>
    <a
      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(item.ytQuery)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="curr-yt-link"
      onClick={e => e.stopPropagation()}
      title="Search YouTube"
    >▶</a>
  </label>
))}
```

- [ ] **Step 3: Add YouTube link style to CSS**

```css
.curr-yt-link { color: #ff4444; font-size: 0.8rem; text-decoration: none; margin-left: 8px; opacity: 0.7; flex-shrink: 0; }
.curr-yt-link:hover { opacity: 1; }
.curr-item { display: flex; align-items: flex-start; gap: 8px; }
```

- [ ] **Step 4: Rebuild frontend dist**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Curriculum.jsx frontend/src/index.css frontend/dist
git commit -m "feat: add YouTube search links to curriculum items"
```

---

## Task 5: Backend AI drill endpoint

**Files:**
- Modify: `backend/routers/train.py`

- [ ] **Step 1: Add the `/ai-drill` endpoint to `backend/routers/train.py`**

Add these imports at the top of the file if not already present:
```python
import json
import time
from pydantic import BaseModel as _BaseModel
```

Add the request schema and endpoint:

```python
class AIDrillRequest(_BaseModel):
    topic: str
    context: str

@router.post("/ai-drill")
def generate_ai_drill(body: AIDrillRequest, current_user: User = Depends(get_current_user)):
    from backend.services.claude import call_claude
    prompt = f"""You are a swing trading quiz generator.

Topic: {body.topic}
Context: {body.context}

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

    for attempt in range(2):
        try:
            raw = call_claude(prompt, max_tokens=1500)
            questions = json.loads(raw)
            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("empty")
            return {"questions": questions}
        except Exception:
            if attempt == 0:
                time.sleep(2)
    raise HTTPException(503, "Could not generate questions, try again")
```

- [ ] **Step 2: Check what `call_claude` looks like in `backend/services/claude.py` and match the signature**

Run:
```bash
grep -n "def call_claude\|def generate\|def ask" backend/services/claude.py | head -10
```

If the function name or signature differs from `call_claude(prompt, max_tokens)`, adjust the call in the endpoint to match what exists.

- [ ] **Step 3: Add `aiDrill` to `frontend/src/api.js`**

```javascript
// Inside the train object:
aiDrill: (body) => request('POST', '/train/ai-drill', body),
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/train.py frontend/src/api.js
git commit -m "feat: add POST /train/ai-drill endpoint"
```

---

## Task 6: On-demand drill modal in Curriculum.jsx

**Files:**
- Modify: `frontend/src/pages/Curriculum.jsx`

- [ ] **Step 1: Add drill modal state and handler**

```javascript
import { api } from '../api'
// existing import — already present

// Add state:
const [drillModal, setDrillModal] = useState(null)  // { topic, context } | null
const [drillQuestions, setDrillQuestions] = useState(null)
const [drillLoading, setDrillLoading] = useState(false)
const [drillError, setDrillError] = useState('')

async function openDrill(item) {
  setDrillModal({ topic: item.id, context: item.text })
  setDrillQuestions(null)
  setDrillError('')
  setDrillLoading(true)
  try {
    const { questions } = await api.train.aiDrill({ topic: item.id, context: item.text })
    setDrillQuestions(questions)
  } catch (e) {
    setDrillError(e.message || 'Could not generate questions, try again')
  } finally {
    setDrillLoading(false)
  }
}

function closeDrill() {
  setDrillModal(null)
  setDrillQuestions(null)
  setDrillError('')
}
```

- [ ] **Step 2: Add "Practice" button to each curriculum item**

In the `items.map` render, after the YouTube link:

```jsx
<button
  className="curr-practice-btn btn-sm btn-ghost"
  onClick={e => { e.preventDefault(); openDrill(item) }}
  title="Generate practice questions"
>Practice</button>
```

- [ ] **Step 3: Add drill modal JSX at the top of the return block**

```jsx
import QuizDrill from '../components/drills/QuizDrill'

// At the top of the return, before <div className="page">:
{drillModal && (
  <div className="modal-overlay" onClick={closeDrill}>
    <div className="modal-box" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <span>Practice: {drillModal.context.slice(0, 60)}…</span>
        <button className="btn-sm btn-ghost" onClick={closeDrill}>✕</button>
      </div>
      {drillLoading && <div className="loading">Generating questions…</div>}
      {drillError && <div className="wl-error">{drillError}</div>}
      {drillQuestions && (
        <QuizDrill
          questions={drillQuestions}
          skill="custom"
          drillKey="ai_drill"
          onComplete={closeDrill}
        />
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Check QuizDrill props**

Run:
```bash
head -40 frontend/src/components/drills/QuizDrill.jsx
```

Confirm the component accepts a `questions` prop directly. If it only reads from `DRILL_QUESTIONS[drillKey]`, add a fallback: the component should use the passed `questions` prop when present, falling back to the static data. Adjust the endpoint code accordingly if needed.

- [ ] **Step 5: Add modal styles to CSS**

```css
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 100; display: flex; align-items: center; justify-content: center; }
.modal-box { background: var(--card); border-radius: 12px; padding: 20px; width: min(90vw, 640px); max-height: 80vh; overflow-y: auto; }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; font-weight: 600; gap: 8px; }
.curr-practice-btn { font-size: 0.72rem; margin-left: 4px; }
```

- [ ] **Step 6: Rebuild frontend dist**

```bash
cd frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Curriculum.jsx frontend/src/index.css frontend/dist
git commit -m "feat: on-demand AI drill modal in curriculum"
```

---

## Task 7: Push and verify

- [ ] **Step 1: Push all commits**

```bash
git push origin master
```

- [ ] **Step 2: Wait for Railway auto-deploy, then verify**

Check https://swing-trainer-production-167e.up.railway.app:
1. Watchlist → add a symbol → click `+ tag` → select tags → confirm they persist after page reload
2. Curriculum → click ▶ on any item → confirm YouTube search opens in new tab
3. Curriculum → click `Practice` on any item → confirm spinner appears → questions render → can answer them

- [ ] **Step 3: Check logs for errors**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
railway logs --tail 20
```

Expected: no ERROR lines for the new endpoints.
