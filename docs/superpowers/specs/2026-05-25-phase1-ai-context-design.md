# Phase 1 — AI with User Context

_Design spec. Stable baseline: `stable-v1` branch._

## Goal

Make Tips, Ask, and Debrief actually know who the user is. Right now all three are stateless — they give generic advice to a generic trader. After this phase, every AI response is grounded in the user's real trade history and skill gaps.

---

## Scope

**In scope:**
- 1A: `get_user_coaching_context()` + prompt caching in `generate_daily_tip` and `generate_ask_tip`
- 1C: Auto-trigger AI debrief on `close_trade()` as a background task

**Already done (no changes needed):**
- 1B: `tips.py` already queries `SkillScore` for the weakest skill and targets it

**Out of scope:**
- Curriculum completion % (deferred to a later iteration)
- Adaptive training, pattern detection, historical charts

---

## 1A — User context function + prompt caching

### New function: `get_user_coaching_context(user, db)`

**File:** `backend/services/claude.py`

Returns a plain-text string to be used as a cached system block. Builds from two DB queries:

```
User: {name} | Stage: {trading_stage} | Budget: {time_budget}
Weakest skill: {skill_label} ({score})
Skill scores: {skill}: {score}, ...

Recent trades (last 20 closed):
  {symbol} {direction} {setup_type}: {r_multiple}R, checklist {checklist_score}%
  ...
```

If the user has no closed trades, omits the trades section. If no skill scores, omits that section. Always returns at least the user profile line.

### Prompt caching

`generate_daily_tip(skill, context=None)` and `generate_ask_tip(question, context=None)` gain an optional `context` parameter. When present, the API call uses a two-block system:

```python
system=[
    {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": "<role instructions>"},
]
```

The context block is cached by Anthropic for ~5 minutes. Cache hits are cheaper and faster. Cache misses (first call, or after TTL) cost the same as a normal call.

The Haiku model requires a minimum of 2048 tokens to cache. With 20 trades the context block comfortably exceeds this. If the user has very few trades (< ~5), caching may not activate — this is acceptable, the call still works without caching.

### Wiring in tips.py

`get_daily_tip` and `ask_tip` both call `get_user_coaching_context(user, db)` before the Claude call and pass the result through.

---

## 1C — Auto-debrief on trade close

### Background task

**File:** `backend/routers/trades.py`

`close_trade()` adds a `BackgroundTasks` parameter. After `db.commit()`, it schedules `_generate_debrief_bg(trade_id)`.

`_generate_debrief_bg(trade_id: int)` is a module-level function that:
1. Opens its own `SessionLocal()` session (cannot reuse request session after response)
2. Fetches the trade by ID
3. Guards: skip if trade not found, not closed, or `ai_debrief` already set
4. Calls `claude_service.generate_trade_debrief(trade)`
5. Saves result to `trade.ai_debrief`, commits, closes session

The existing `POST /{trade_id}/ai-debrief` endpoint stays as a manual refresh.

### Error handling

Exceptions in the background task are logged but do not surface to the user — the close already succeeded. No retry logic.

---

## Files changed

| File | Change |
|------|--------|
| `backend/services/claude.py` | Add `get_user_coaching_context()`, update `generate_daily_tip` and `generate_ask_tip` signatures |
| `backend/routers/tips.py` | Call `get_user_coaching_context`, pass context to both tip functions |
| `backend/routers/trades.py` | Add `BackgroundTasks`, add `_generate_debrief_bg` helper, schedule on close |

No schema changes. No new dependencies. No frontend changes.

---

## Success criteria

- Daily tip references the user's weakest skill by name in the response text
- Ask tip answers feel contextually grounded (references trade patterns when relevant)
- Closing a trade returns immediately; `ai_debrief` is populated within ~5 seconds on subsequent journal load
- No regression: manual `/ai-debrief` endpoint still works
