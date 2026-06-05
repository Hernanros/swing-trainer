# Drill Question Bank Expansion

**Date:** 2026-06-06  
**Status:** Approved

## Goal

Expand the swing trading drill question bank from 104 questions across 8 categories to ~550 questions across 12 categories, covering the breadth of a college-level or professional training curriculum. Add source attribution and difficulty tagging to every question. Build a reusable generation + validation pipeline so the bank can grow further without manual effort.

---

## Architecture

Three scripts run once locally; output is committed to the repo.

```
scripts/
  question-taxonomy.js        ← course outline: all sub-topics per category with sources
  generate-question-bank.js   ← calls Claude API in batches, outputs JSON per category
  validate-question-bank.js   ← second Claude pass: flags wrong answers, ambiguity, errors
  merge-question-bank.js      ← appends validated questions to drillQuestions.js safely
  output/                     ← generated + validated JSON (gitignored)
```

### Data flow

1. `node scripts/generate-question-bank.js` — reads taxonomy, calls Claude ~120 times (one per sub-topic), writes `output/generated-{category}.json`
2. `node scripts/validate-question-bank.js` — reviews every question, writes `output/validated-{category}.json` with a `flag` field per question
3. Operator scans ERROR-flagged questions and fixes or discards manually
4. `node scripts/merge-question-bank.js` — skips ERROR questions, appends the rest to `drillQuestions.js`, updates `DRILL_META`, balances answer positions for new questions only

### Key constraint

Existing questions in each category array are never modified. New questions are appended only. This preserves all `bank_idx` values so no user mastery records are invalidated.

---

## Taxonomy

Each sub-topic generates 5 questions via Claude. Existing questions are provided as context so duplicates are avoided.

### Existing categories (15 → ~50 questions each)

**setup_selection**  
New sub-topics: CANSLIM fundamentals at entry · IPO bases · pocket pivot entries · three-weeks-tight pattern · handle quality filters · RS rank/percentile · market follow-through day · distribution day count · sector leadership identification · base symmetry and shape quality  
Sources: O'Neil - *How to Make Money in Stocks*, Minervini - *Trade Like a Stock Market Wizard*

**entry_timing**  
New sub-topics: pre-market gap assessment · opening range breakout timing · limit vs market order mechanics · scaling in vs all-in · re-entry conditions after a stop-out · 5-min chart for precision timing · end-of-day entry rules · midday lull avoidance · earnings-driven gap entries  
Sources: O'Neil - *HTMMIS*, Minervini - *TLSMW*

**trade_management**  
New sub-topics: R-multiple framework · portfolio heat calculation · scaling out at targets · ATR-based trailing stops · gap-down risk management · overnight exposure rules · maximum drawdown limits · sector rotation response · time-based exit (time stop)  
Sources: O'Neil - *HTMMIS*, Elder - *Trading for a Living*

**emotional_discipline**  
New sub-topics: confirmation bias · recency bias · overtrading after a win · pre-market routine and preparation · post-trade review process · FOMO during a bull market · paralysis after drawdown · community/forum influence on decisions  
Sources: Douglas - *Trading in the Zone*, Elder - *Trading for a Living*

**chart_reading**  
New sub-topics: accumulation vs distribution day identification · churning (high volume, no progress) · volume dry-up (VDU) signals · weekly vs daily chart priority · stalling action · price spread analysis · gap type classification · island reversals  
Sources: O'Neil - *HTMMIS*, Murphy - *Technical Analysis of Financial Markets*

**chart_patterns**  
New sub-topics: ascending triangle · descending triangle · symmetrical triangle · rising wedge (bearish) · falling wedge (bullish) · pennant · cup-without-handle · high tight flag · morning star / evening star · doji types · harami  
Sources: Murphy - *Technical Analysis*, Bulkowski - *Encyclopedia of Chart Patterns*

**support_resistance**  
New sub-topics: psychological round numbers · moving average as dynamic support · Fibonacci retracements (38.2 / 50 / 61.8%) · gap fill levels · prior base highs as future support · support confluence (multiple types at one level)  
Sources: Murphy - *Technical Analysis*, Weinstein - *Secrets for Profiting*

**channels**  
New sub-topics: channel midline as pivot · trading descending channel shorts · horizontal channel (trading range) · channel width and volatility · false channel breaks  
Sources: Murphy - *Technical Analysis*

---

### New categories (~40–50 questions each)

**technical_indicators**  
Sub-topics: RSI overbought/oversold + divergence · RSI failure swings + centerline (50 level) · MACD crossovers + histogram · MACD divergence (bullish/bearish) · Bollinger Band squeeze + breakout · VWAP intraday support/resistance · OBV confirmation + divergence · Stochastics extremes + crossovers · moving average alignment and spacing · indicator confluence vs contradiction  
Sources: Murphy - *Technical Analysis*, Wilder - *New Concepts in Technical Trading Systems*

**market_internals**  
Sub-topics: advance/decline line breadth confirmation · new 52-week highs/lows ratio · VIX interpretation · put/call ratio signals · distribution day count · follow-through day confirmation · sector rotation cycle · sector relative strength · index divergence (small cap vs large cap) · market trend confirmation framework  
Sources: O'Neil - *HTMMIS*, Murphy - *Technical Analysis*

**short_selling**  
Sub-topics: mechanics (locating shares, margin, borrowing cost) · failed breakout as short setup · head and shoulders top short entry · climax top shorting · short squeeze mechanics and risk · covering rules and stop placement · downtrend context for shorts · risk/reward asymmetry on short side  
Sources: Minervini - *TLSMW*, O'Neil - *How to Make Money in Stocks*

**gap_trading**  
Sub-topics: gap classification (common / breakaway / continuation / exhaustion) · fill probability by gap type · earnings gap plays (gap-and-go vs. fade) · gap-up entry rules and buy zone · gap-down response and exit rules · pre-market gap assessment · gap at support/resistance levels · failed gap reversals  
Sources: Bulkowski - *Getting Started in Chart Patterns*, Murphy - *Technical Analysis*

---

## Question format

Every question (new and existing-compatible) uses this shape. The three new fields are additive — existing frontend code ignores unknown fields.

```js
{
  q: "Question text",
  options: ["A", "B", "C", "D"],   // exactly 4 options
  correct: 1,                       // 0-based index
  explanation: "Why this answer is correct and others are wrong",
  chartKey: "optional_chart_key",   // existing field, optional
  source: "Murphy - Technical Analysis of Financial Markets",  // new
  difficulty: "intermediate",        // new: "beginner" | "intermediate" | "advanced"
  tags: ["RSI", "divergence"],       // new: sub-topic tags for future filtering
}
```

Answer positions (correct: 0/1/2/3) are balanced to ~25% each across all new questions per category, enforced by the merge script.

---

## Validation pass

Each generated question is reviewed by a second Claude call:

**Prompt structure:**
```
Review this swing trading quiz question for factual accuracy.

Q: <question>
Options: A) ... B) ... C) ... D) ...
Marked correct: <option text>
Explanation: <explanation>
Source: <source>

Check:
1. Is the marked answer factually correct?
2. Is any other option also defensibly correct?
3. Is the question unambiguous?
4. Is the explanation accurate?

Respond with JSON only: { "verdict": "OK|WARN|ERROR", "issue": "description or null" }
```

**Verdict handling:**
- `OK` — included in merge as-is
- `WARN` — minor issue (wording, style); included but logged to `output/warnings.json`
- `ERROR` — wrong answer or factual error; excluded from merge, logged to `output/errors.json`

Merge script prints a summary: `450 OK · 12 WARN · 3 ERROR (fix manually in output/errors.json)`.

---

## Integration changes

### Backend — `backend/schemas.py`

```python
VALID_SKILLS = [
    ...existing...,
    "technical_indicators",
    "market_internals",
    "short_selling",
    "gap_trading",
]

VALID_DRILL_KEYS = [
    ...existing...,
    "technical_indicators",
    "market_internals",
    "short_selling",
    "gap_trading",
]
```

### Frontend — `drillQuestions.js` DRILL_META

```js
technical_indicators: { label: 'Technical Indicators', type: 'indicator_quiz', skill: 'technical_indicators' },
market_internals:     { label: 'Market Internals',      type: 'internals_quiz', skill: 'market_internals'     },
short_selling:        { label: 'Short Selling',          type: 'short_quiz',    skill: 'short_selling'        },
gap_trading:          { label: 'Gap Trading',            type: 'gap_quiz',      skill: 'gap_trading'          },
```

### Existing users

New skills are not in any existing user's `active_skills`. The Train page already filters drills to active skills, so new categories are invisible until a user opts in. New skills are added to the settings page skill picker — no DB migration needed.

---

## Estimated output

| Category | Existing | New | Total |
|---|---|---|---|
| setup_selection | 15 | 35 | 50 |
| entry_timing | 15 | 35 | 50 |
| trade_management | 15 | 35 | 50 |
| emotional_discipline | 15 | 35 | 50 |
| chart_reading | 15 | 35 | 50 |
| chart_patterns | 15 | 36 | 51 |
| support_resistance | 7 | 33 | 40 |
| channels | 7 | 23 | 30 |
| technical_indicators | 0 | 50 | 50 |
| market_internals | 0 | 50 | 50 |
| short_selling | 0 | 40 | 40 |
| gap_trading | 0 | 40 | 40 |
| **Total** | **104** | **447** | **~551** |

---

## Cost estimate

- ~120 generation calls × ~2,000 tokens avg = ~240k tokens
- ~450 validation calls × ~800 tokens avg = ~360k tokens
- Total ~600k tokens with Claude Haiku: **~$1.50–2.00**
- Total ~600k tokens with Claude Sonnet: **~$5–7**

Scripts use the `ANTHROPIC_API_KEY` env var already present in the local environment.
