# Design: Watchlist Tags, Curriculum YouTube Links, On-Demand AI Drills

**Date:** 2026-05-22  
**Status:** Approved

---

## 1. Watchlist Tags

### Data Model
Add a `tags` TEXT column to `WatchlistItem` storing a JSON array of strings (e.g. `["VCP", "High", "Watching"]`).  
Migration handled via SQLAlchemy `text("ALTER TABLE watchlist ADD COLUMN tags TEXT DEFAULT '[]'")` in `main.py` lifespan.

### Predefined Tags (3 categories)
- **Setup:** VCP, Cup & Handle, Flat Base, Breakout, Pullback
- **Stage:** Watching, Ready to Buy, Passed
- **Priority:** High, Medium, Low

Multiple tags allowed across different categories. No limit to mixing categories.

### Backend Changes
- `WatchlistItem` model: add `tags = Column(Text, default='[]')`
- Schema `WatchlistItemResponse`: add `tags: list[str]`
- Schema `WatchlistItemCreate`: add `tags: list[str] = []`
- New endpoint: `PUT /api/watchlist/{id}/tags` — accepts `{ tags: string[] }`, updates and returns item
- `api.watchlist.updateTags(id, tags)` added to `frontend/src/api.js`

### Frontend Changes
- `Watchlist.jsx`: add a tag display row under each symbol
- Clicking the tag row opens an inline tag picker showing all predefined chips grouped by category
- Active tags shown as filled chips; inactive as outlines
- Clicking a chip toggles it and auto-saves via `updateTags`

---

## 2. Curriculum YouTube Links

### Approach
Hardcode AI-crafted YouTube search queries for all 30 curriculum items directly in `Curriculum.jsx`. No runtime API call. Each item gets a `ytQuery` field added to the existing `CURRICULUM` data structure.

### UI
Each curriculum item gets a small YouTube icon/button on the right. Clicking opens:  
`https://www.youtube.com/results?search_query=<encodeURIComponent(ytQuery)>`  
in a new tab.

### Query Quality
Queries are crafted to find educational swing trading videos (e.g., `"VCP volatility contraction pattern swing trading tutorial"` rather than the raw item text).

---

## 3. On-Demand AI Drills

### Flow
1. Each curriculum item has a "Practice" button
2. Click → loading spinner → POST `/api/train/ai-drill` with `{ topic, context }` where `context` is the curriculum item text
3. Backend calls Anthropic (claude-haiku-4-5 for speed/cost) → generates 5 quiz questions
4. Response returned as `{ questions: QuizQuestion[] }`
5. Frontend renders a modal with the existing `QuizDrill` component
6. Results shown but **not** written to `DrillResult` or skill scores (supplemental)

### Backend Endpoint
`POST /api/train/ai-drill`  
Request: `{ topic: str, context: str }`  
Response: `{ questions: list[QuizQuestion] }`

QuizQuestion shape (matches existing `DRILL_QUESTIONS` format):
```json
{
  "q": "Question text",
  "choices": ["A", "B", "C", "D"],
  "answer": 0,
  "explanation": "Why A is correct"
}
```

Prompt instructs the model to return valid JSON only. Parse with `json.loads`; on failure return 503.

### Existing Component Reuse
`QuizDrill` accepts a `questions` prop directly. Mount it inside a modal overlay in `Curriculum.jsx`. No changes to `QuizDrill` itself.

### Error Handling
- Anthropic 529 (overloaded): retry once after 2 seconds
- Parse failure: 503 with `"Could not generate questions, try again"`
- Frontend shows the error message inline in the modal

---

## Scope Boundaries
- Tags are not filterable in this version (display + edit only)
- YouTube links open search, not a specific video
- AI drills are ephemeral — no history, no scoring impact
- No changes to existing drill scoring or skill score logic
