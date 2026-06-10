# Phase 7: Options Trading Module - Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 6 new/modified files
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/models.py` | model | CRUD | `backend/models.py` (self — existing `Trade` columns pattern) | exact |
| `backend/main.py` | config | CRUD | `backend/main.py` (self — lifespan migration pattern, lines 104–119) | exact |
| `backend/schemas.py` | model | request-response | `backend/schemas.py` (self — `TradeCreate`/`TradeResponse` option fields, lines 70–129) | exact |
| `backend/routers/trades.py` | route/controller | request-response | `backend/routers/trades.py` (self — `generate_ai_debrief` endpoint, lines 268–286) | exact |
| `backend/services/claude.py` | service | request-response | `backend/services/claude.py` (self — `call_claude()` + `generate_trade_debrief()`) | exact |
| `frontend/src/data/drillQuestions.js` | utility/data | transform | `frontend/src/data/drillQuestions.js` (self — `short_selling` block, lines 521–562; `DRILL_META`, lines 607–621) | exact |

---

## Pattern Assignments

### `backend/models.py` — add `pre_trade_advisory` column

**Change:** Add one `Column` to the existing `Trade` model after `option_spread_type`.

**Analog:** Existing option columns in `backend/models.py` (lines 58–63):
```python
trade_type            = Column(String, nullable=False, default="equity", server_default="equity")
option_expiry         = Column(String, nullable=True)
option_long_strike    = Column(Float,  nullable=True)
option_short_strike   = Column(Float,  nullable=True)
option_spread_type    = Column(String, nullable=True)
```

**Pattern to copy — new column declaration (insert after line 63):**
```python
pre_trade_advisory    = Column(Text,   nullable=True)
```

Copy the `nullable=True` + `Text` type convention used by `pre_note`, `debrief`, `ai_debrief` — all advisory/freeform text fields use `Text`.

---

### `backend/main.py` — lifespan migration for `pre_trade_advisory`

**Change:** Add one `ALTER TABLE` guard inside the lifespan block.

**Analog:** Existing option column migration pattern (`backend/main.py` lines 104–119):
```python
option_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(trades)"))]
if "trade_type" not in option_cols:
    conn.execute(text("ALTER TABLE trades ADD COLUMN trade_type TEXT NOT NULL DEFAULT 'equity'"))
    conn.commit()
if "option_expiry" not in option_cols:
    conn.execute(text("ALTER TABLE trades ADD COLUMN option_expiry TEXT"))
    conn.commit()
if "option_long_strike" not in option_cols:
    conn.execute(text("ALTER TABLE trades ADD COLUMN option_long_strike REAL"))
    conn.commit()
if "option_short_strike" not in option_cols:
    conn.execute(text("ALTER TABLE trades ADD COLUMN option_short_strike REAL"))
    conn.commit()
if "option_spread_type" not in option_cols:
    conn.execute(text("ALTER TABLE trades ADD COLUMN option_spread_type TEXT"))
    conn.commit()
```

**Pattern to copy — new migration guard (append inside the same `with engine.connect()` block):**
```python
if "pre_trade_advisory" not in option_cols:
    conn.execute(text("ALTER TABLE trades ADD COLUMN pre_trade_advisory TEXT"))
    conn.commit()
```

Key details: reuse the already-fetched `option_cols` list (same `PRAGMA` query); `TEXT` type; nullable (no `NOT NULL DEFAULT`); `conn.commit()` immediately after each `ALTER TABLE`.

---

### `backend/schemas.py` — add `pre_trade_advisory` to `TradeCreate` and `TradeResponse`; add `"options_setups"` to `VALID_DRILL_KEYS`

**Change 1 — `VALID_DRILL_KEYS` (lines 19–32):**

Add `"options_setups"` to the list. Existing pattern:
```python
VALID_DRILL_KEYS = [
    "setup_selection",
    "entry_timing",
    ...
    "short_selling",
    "gap_trading",
]
```
Append `"options_setups"` as the last item.

**Change 2 — `TradeCreate` (lines 70–88):**

Existing option field pattern (lines 82–87):
```python
trade_type:          str            = "equity"
option_expiry:       Optional[str]  = None
option_long_strike:  Optional[float]= None
option_short_strike: Optional[float]= None
option_spread_type:  Optional[str]  = None
```

Add after `option_spread_type`:
```python
pre_trade_advisory:  Optional[str]  = None
```

**Change 3 — `TradeResponse` (lines 99–129):**

Existing option field pattern (lines 121–128):
```python
trade_type:          str            = "equity"
option_expiry:       Optional[str]  = None
option_long_strike:  Optional[float]= None
option_short_strike: Optional[float]= None
option_spread_type:  Optional[str]  = None
max_profit:          Optional[float]= None
max_loss:            Optional[float]= None
breakeven:           Optional[float]= None
```

Add after `option_spread_type`, before `max_profit`:
```python
pre_trade_advisory:  Optional[str]  = None
```

---

### `backend/routers/trades.py` — add `POST /api/trades/spread-advisory` endpoint; surface `pre_trade_advisory` in `_to_response` and `open_trade`

**Sub-change A — `_to_response` (lines 66–98):**

Existing option fields in `base` dict (lines 88–94):
```python
"trade_type":          t.trade_type or "equity",
"option_expiry":       t.option_expiry,
"option_long_strike":  t.option_long_strike,
"option_short_strike": t.option_short_strike,
"option_spread_type":  t.option_spread_type,
"max_profit":          None,
"max_loss":            None,
"breakeven":           None,
```

Add `"pre_trade_advisory": t.pre_trade_advisory,` after `"option_spread_type"`.

**Sub-change B — `open_trade` (lines 154–178):**

Existing option fields in `Trade(...)` constructor (lines 169–173):
```python
trade_type=body.trade_type,
option_expiry=body.option_expiry,
option_long_strike=body.option_long_strike,
option_short_strike=body.option_short_strike,
option_spread_type=body.option_spread_type,
```

Add `pre_trade_advisory=body.pre_trade_advisory,` after `option_spread_type`.

**Sub-change C — new `POST /trades/spread-advisory` endpoint:**

**Analog:** `generate_ai_debrief` endpoint (`backend/routers/trades.py` lines 268–286):
```python
@router.post("/{trade_id}/ai-debrief", response_model=TradeResponse)
def generate_ai_debrief(
    trade_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trade = db.query(Trade).filter(
        Trade.id == trade_id,
        Trade.user_id == current_user.id,
    ).first()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != "closed":
        raise HTTPException(400, "Trade must be closed before generating a debrief")
    coaching_context = claude_service.get_user_coaching_context(current_user, db)
    trade.ai_debrief = claude_service.generate_trade_debrief(trade, coaching_context=coaching_context)
    db.commit()
    db.refresh(trade)
    return _to_response(trade)
```

**New endpoint pattern (does NOT write to DB — advisory is returned, not saved):**
```python
class SpreadAdvisoryRequest(BaseModel):
    symbol: str
    option_spread_type: str
    option_long_strike: float
    option_short_strike: float
    option_expiry: str
    entry_price: float
    shares: int
    setup_type: Optional[str] = None

@router.post("/spread-advisory")
def get_spread_advisory(
    body: SpreadAdvisoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.option_spread_type not in VALID_SPREADS:
        raise HTTPException(400, f"option_spread_type must be one of: {sorted(VALID_SPREADS)}")
    rules = []
    if body.setup_type:
        rules = db.query(PlaybookRule).filter(
            PlaybookRule.user_id == current_user.id,
            PlaybookRule.setup_type == body.setup_type,
            PlaybookRule.active == True,
        ).all()
    advisory = claude_service.generate_spread_advisory(body, rules)
    return {"advisory": advisory}
```

Key details: `SpreadAdvisoryRequest` Pydantic model (inline or in `schemas.py`); import `PlaybookRule`; call new service function; return plain dict (no `response_model` — advisory is a string).

---

### `backend/services/claude.py` — add `generate_spread_advisory()` and update `generate_trade_debrief()` for `pre_trade_advisory`

**Sub-change A — `generate_spread_advisory()` (new function):**

**Analog:** `call_claude()` (lines 59–70) + `generate_trade_debrief()` option_spread branch (lines 85–118). Copy the graceful-degradation guard, the `Anthropic` client init, and the direct `client.messages.create` pattern:

```python
def call_claude(prompt: str, max_tokens: int = 1000) -> str:
    if not _api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text
```

**New function:**
```python
def generate_spread_advisory(trade_data, rules: list) -> str:
    """Pre-trade advisory for an option spread. Returns < 200 words plain text."""
    if not _api_key:
        return "[Advisory unavailable — set ANTHROPIC_API_KEY to enable]"
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)

    long_s  = trade_data.option_long_strike
    short_s = trade_data.option_short_strike
    width   = abs(long_s - short_s)
    spread_label = _SPREAD_LABELS.get(trade_data.option_spread_type, trade_data.option_spread_type)
    is_debit = trade_data.option_spread_type in _DEBIT_SPREADS
    if is_debit:
        max_loss   = round(trade_data.entry_price * trade_data.shares * 100, 2)
        max_profit = round((width - trade_data.entry_price) * trade_data.shares * 100, 2)
    else:
        max_loss   = round((width - trade_data.entry_price) * trade_data.shares * 100, 2)
        max_profit = round(trade_data.entry_price * trade_data.shares * 100, 2)

    rules_text = "\n".join(f"- [{r.tier.upper()}] {r.text}" for r in rules) if rules else "No playbook rules loaded."

    prompt = (
        f"You are a professional options trading coach. Evaluate this spread BEFORE the trader enters it.\n\n"
        f"Spread: {spread_label} on {trade_data.symbol}\n"
        f"Strikes: {long_s}/{short_s} | Width: {width} | Expiry: {trade_data.option_expiry}\n"
        f"Premium {'paid' if is_debit else 'received'}: ${trade_data.entry_price} | Contracts: {trade_data.shares}\n"
        f"Max risk: ${max_loss} | Max profit: ${max_profit}\n\n"
        f"Playbook rules for this setup:\n{rules_text}\n\n"
        "Write a concise advisory in exactly 3 parts (no headers, 2-3 sentences each):\n"
        "1. Strike placement — are the strikes appropriately placed relative to the underlying?\n"
        "2. Risk/reward quality — is the premium vs. spread width favorable?\n"
        "3. Expectations and key risk — what should the trader expect, when to close, and what is the primary risk?\n\n"
        "Plain text only. Under 200 words total."
    )
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text
```

**Sub-change B — extend `generate_trade_debrief()` for `pre_trade_advisory`:**

**Analog:** Existing `pre_note` inclusion in `trade_block` (line 110):
```python
f"- Pre-trade note: {trade.pre_note or 'None'}"
```

After `pre_note` line in the `option_spread` branch `trade_block`, append:
```python
+ (f"\n- Pre-trade advisory: {trade.pre_trade_advisory}" if getattr(trade, 'pre_trade_advisory', None) else "")
```

Also append to the `paragraphs` string for the option_spread branch, before the closing quote — inject the plan-vs-execution prompt when advisory exists:
```python
advisory_hook = (
    f"\n\nPre-trade advisory given:\n{trade.pre_trade_advisory}\n"
    "In paragraph 1, briefly compare whether the outcome matched the advisory's expectations."
) if getattr(trade, 'pre_trade_advisory', None) else ""
```
Then append `advisory_hook` to `prompt` after `paragraphs`.

---

### `frontend/src/data/drillQuestions.js` — add `options_setups` drill bank and `DRILL_META` entry

**Change 1 — new question block in `DRILL_QUESTIONS`:**

**Analog:** `short_selling` block (lines 521–562). Full question object structure:
```js
{
  "q": "Question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct": 0,          // 0-based index — WILL be shuffled by scripts/shuffle-answers.js
  "explanation": "...",
  "difficulty": "beginner" | "intermediate" | "advanced",
  "tags": ["tag1", "tag2"],
  "source": "Source text"
}
```

Questions WITHOUT a chart use this shape exactly. Questions with a chart add `"chartKey": "..."` as the first field (see `setup_selection` block, line 3).

Options drills use text-only questions — no `chartKey` needed.

Add `options_setups` key at end of `DRILL_QUESTIONS` object (before the closing `}`), following the same comma-separated array format as other keys. Minimum 20 questions; distribution per D-05/specifics:
- 5 bull put spread questions
- 5 bear call spread questions
- 5 strike selection / probability questions
- 5 behavioral / exit discipline questions

**Change 2 — `DRILL_META` entry (lines 607–621):**

Existing entry pattern for `short_selling` (line 619):
```js
short_selling: {"label":"Short Selling","type":"short_quiz","skill":"short_selling"},
```

Add after `gap_trading`:
```js
options_setups: {"label":"Options Spreads","type":"options_quiz","skill":"setup_selection"},
```

Note on `skill` field: `"setup_selection"` is the closest mapped skill from `VALID_SKILLS`. Options drill questions map to `setup_selection` since `VALID_SKILLS` does not include a dedicated `options` skill. The `type` value `"options_quiz"` is a new value — match the `_quiz` suffix convention.

**After adding questions, run:**
```bash
node scripts/shuffle-answers.js
```
This redistributes correct answer positions so they are not all `correct: 0`.

---

### `frontend/src/components/TradeDrawer.jsx` — add "Get Advisory" button for option_spread open-mode

**Analog:** Existing option spread form section in `TradeDrawer.jsx`. The pattern for adding a stateful async action button:

**State pattern** (copy from `saving` / `setSaving` pattern, lines 29–30):
```jsx
const [advisory, setAdvisory]         = useState(null)
const [advisoryLoading, setAdvisoryLoading] = useState(false)
```

**API call pattern** (copy from `handleSubmit` try/catch/finally, lines 172–213):
```jsx
async function handleGetAdvisory() {
  setAdvisoryLoading(true)
  setAdvisory(null)
  try {
    const result = await api.trades.spreadAdvisory({
      symbol:              form.symbol.trim(),
      option_spread_type:  form.option_spread_type,
      option_long_strike:  +form.option_long_strike,
      option_short_strike: +form.option_short_strike,
      option_expiry:       form.option_expiry,
      entry_price:         +form.entry_price,
      shares:              +form.shares,
      setup_type:          form.setup_type || null,
    })
    setAdvisory(result.advisory)
  } catch (err) {
    setAdvisory(`Advisory error: ${err.message}`)
  } finally {
    setAdvisoryLoading(false)
  }
}
```

**Button render pattern** (copy from trade-type toggle buttons, lines 264–280 — same `type="button"`, `onClick`, inline style):
```jsx
{form.trade_type === 'option_spread' && mode === 'open' && (
  <>
    <button
      type="button"
      onClick={handleGetAdvisory}
      disabled={advisoryLoading || !form.option_spread_type || !form.option_long_strike || !form.option_short_strike || !form.entry_price}
      style={{
        padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
        border: '1px solid var(--accent)', background: 'transparent',
        color: 'var(--accent)', cursor: 'pointer', width: '100%',
      }}
    >
      {advisoryLoading ? 'Getting advisory…' : 'Get Advisory'}
    </button>
    {advisory && (
      <div style={{
        background: 'var(--surface2)', border: '1px solid var(--border2)',
        borderRadius: 6, padding: '10px 12px', fontSize: 12,
        color: 'var(--muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
      }}>
        {advisory}
      </div>
    )}
  </>
)}
```

**`api.js` addition — new `spreadAdvisory` method:**

Existing `trades` namespace (lines 54–59):
```js
trades: {
  list:    ()         => request('GET',  '/trades/'),
  open:    (body)     => request('POST', '/trades/', body),
  close:   (id, body) => request('PUT',  `/trades/${id}/close`, body),
  debrief: (id)       => request('POST', `/trades/${id}/ai-debrief`),
},
```

Add:
```js
spreadAdvisory: (body) => request('POST', '/trades/spread-advisory', body),
```

**`pre_trade_advisory` passthrough in `handleSubmit`:**

In the `data` object for `mode === 'open'` (lines 178–198), inside the `...(form.trade_type === 'option_spread' && {...})` spread, add:
```js
pre_trade_advisory: advisory || null,
```

---

## Shared Patterns

### Auth / dependency injection
**Source:** `backend/routers/trades.py` (every endpoint)
**Apply to:** new `POST /trades/spread-advisory` endpoint
```python
current_user: User = Depends(get_current_user),
db: Session = Depends(get_db),
```
All endpoints in `trades.py` use these two dependencies. The router is mounted with `dependencies=[Depends(require_auth)]` in `main.py` so session-level auth is already enforced.

### Graceful Claude degradation
**Source:** `backend/services/claude.py` lines 59–62, 75–76
**Apply to:** `generate_spread_advisory()`
```python
if not _api_key:
    return "[Advisory unavailable — set ANTHROPIC_API_KEY to enable]"
```
Every Claude function checks `_api_key` at entry and returns a fallback string (never raises) so the UI degrades gracefully.

### `VALID_SPREADS` guard
**Source:** `backend/routers/trades.py` lines 132–133
**Apply to:** `spread-advisory` endpoint validation
```python
if body.option_spread_type not in VALID_SPREADS:
    raise HTTPException(400, f"option_spread_type must be one of: {sorted(VALID_SPREADS)}")
```

### CSS variable theming
**Source:** `frontend/src/components/TradeDrawer.jsx` (throughout)
**Apply to:** advisory button and advisory display panel
All inline styles use CSS variables: `var(--surface)`, `var(--surface2)`, `var(--border)`, `var(--border2)`, `var(--accent)`, `var(--muted)`, `var(--text)`, `var(--red)`. Never hardcode hex values.

### `DRILL_META` type-string convention
**Source:** `frontend/src/data/drillQuestions.js` lines 607–621
**Apply to:** `options_setups` DRILL_META entry
All `type` values end in `_quiz` (e.g., `"short_quiz"`, `"gap_quiz"`). Use `"options_quiz"` for the new entry.

---

## No Analog Found

No files are entirely without analog — all 6 files have exact self-referential analogs (extension of existing patterns in the same files).

---

## Metadata

**Analog search scope:** `backend/models.py`, `backend/main.py`, `backend/schemas.py`, `backend/routers/trades.py`, `backend/routers/train.py`, `backend/services/claude.py`, `frontend/src/components/TradeDrawer.jsx`, `frontend/src/data/drillQuestions.js`, `frontend/src/api.js`
**Files read:** 11
**Pattern extraction date:** 2026-06-10
