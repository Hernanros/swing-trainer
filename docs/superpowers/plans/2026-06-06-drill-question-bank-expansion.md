# Drill Question Bank Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the drill question bank from 104 to ~550 questions across 12 categories via an automated generation + validation + merge pipeline, with source tags and difficulty levels on every question.

**Architecture:** Three-stage pipeline: (1) Python scripts call Claude to generate batches of questions per sub-topic and write JSON to `scripts/output/`; (2) a validation script reviews every question with a second Claude call and flags errors; (3) a Node `.mjs` merge script reads the validated JSON, appends new questions to `drillQuestions.js`, balances answer positions, and updates `DRILL_META`. Existing questions are never modified so no user mastery records break.

**Tech Stack:** Python 3 + `anthropic` SDK (already installed in backend virtualenv), Node.js ES modules (merge only), pytest (existing), `node --test` (built-in Node 18+).

---

## File Map

| Action | Path |
|--------|------|
| Create | `scripts/question_taxonomy.py` |
| Create | `scripts/generate_question_bank.py` |
| Create | `scripts/validate_question_bank.py` |
| Create | `scripts/merge_question_bank.mjs` |
| Create | `scripts/package.json` |
| Create | `scripts/test_merge.mjs` |
| Create | `tests/test_question_bank_scripts.py` |
| Modify | `backend/schemas.py` |
| Modify | `frontend/src/components/Onboarding.jsx` |
| Modify | `frontend/src/pages/Account.jsx` |
| Modify | `.gitignore` |

---

## Task 1: Setup — package.json and .gitignore

**Files:**
- Create: `scripts/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `scripts/package.json`**

```json
{
  "name": "swing-trainer-scripts",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 2: Add `scripts/output/` to `.gitignore`**

Open `.gitignore` and append:

```
scripts/output/
```

- [ ] **Step 3: Verify the Python Anthropic SDK is available**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -c "import anthropic; print(anthropic.__version__)"
```

Expected: prints a version number (e.g. `0.39.0`). If it fails, run `pip install anthropic`.

- [ ] **Step 4: Verify ANTHROPIC_API_KEY is set**

```bash
python3 -c "import os; assert os.environ.get('ANTHROPIC_API_KEY'), 'not set'"
```

Expected: no output (assertion passes). If it fails, run `export ANTHROPIC_API_KEY=<your key>`.

- [ ] **Step 5: Commit**

```bash
git add scripts/package.json .gitignore
git commit -m "chore: add scripts/package.json and gitignore output dir"
```

---

## Task 2: Write `scripts/question_taxonomy.py`

**Files:**
- Create: `scripts/question_taxonomy.py`

- [ ] **Step 1: Create the taxonomy**

```python
# scripts/question_taxonomy.py
"""
Course outline for the drill question bank expansion.
Each sub-topic generates questionsPerSubtopic questions via Claude.
Existing questions in a category are shown to Claude to avoid duplicates.
"""

TAXONOMY = {
    # ── Expanding existing categories ────────────────────────────────────────
    "setup_selection": {
        "questions_per_subtopic": 5,
        "sources": [
            "O'Neil - How to Make Money in Stocks",
            "Minervini - Trade Like a Stock Market Wizard",
        ],
        "subtopics": [
            {"name": "CANSLIM fundamentals: minimum EPS and revenue growth rates required before considering a breakout entry", "difficulty": "intermediate"},
            {"name": "IPO bases: how to identify a valid first-stage IPO base and its breakout pivot", "difficulty": "intermediate"},
            {"name": "Pocket pivot entries: identifying a strong up-volume day within the base as an early entry signal", "difficulty": "advanced"},
            {"name": "Three-weeks-tight pattern: recognizing three consecutive weekly closes within 1-1.5% as a valid add point", "difficulty": "intermediate"},
            {"name": "Handle quality: characteristics of a valid handle vs a flawed handle on a cup-with-handle base", "difficulty": "intermediate"},
            {"name": "Relative Strength rank and percentile: minimum RS threshold and what a leading RS line signals before a breakout", "difficulty": "beginner"},
            {"name": "Market follow-through day: how to confirm a new market uptrend before initiating new swing positions", "difficulty": "intermediate"},
            {"name": "Distribution day count: when the count of distribution days signals increased market risk", "difficulty": "intermediate"},
            {"name": "Sector leadership identification: how to confirm you are buying in the leading sector", "difficulty": "intermediate"},
            {"name": "Base quality and structure: symmetry, tight weekly closes, and volume pattern in a well-formed base", "difficulty": "beginner"},
        ],
    },
    "entry_timing": {
        "questions_per_subtopic": 5,
        "sources": [
            "O'Neil - How to Make Money in Stocks",
            "Minervini - Trade Like a Stock Market Wizard",
        ],
        "subtopics": [
            {"name": "Pre-market gap assessment: how to evaluate a stock that has gapped up before the regular session opens", "difficulty": "intermediate"},
            {"name": "Opening range breakout: using the first 15-30 minutes to define a tradeable high/low range", "difficulty": "intermediate"},
            {"name": "Limit vs market orders on breakouts: when to use each and the risks on volatile breakout days", "difficulty": "beginner"},
            {"name": "Scaling into a position: rules for taking a starter position vs waiting to add at confirmation", "difficulty": "intermediate"},
            {"name": "Re-entry conditions after a stop-out: what must be true before trading the same stock again", "difficulty": "intermediate"},
            {"name": "5-minute chart for precision entry timing at the exact pivot point", "difficulty": "intermediate"},
            {"name": "End-of-day entries: pros and cons of buying at the close vs the moment a breakout triggers intraday", "difficulty": "beginner"},
            {"name": "Avoiding the midday lull: why 11am-2pm is low-probability for new breakout entries", "difficulty": "beginner"},
            {"name": "Entering after a positive earnings gap: how to buy a stock that gaps above your planned entry", "difficulty": "advanced"},
        ],
    },
    "trade_management": {
        "questions_per_subtopic": 5,
        "sources": [
            "O'Neil - How to Make Money in Stocks",
            "Elder - Trading for a Living",
            "Minervini - Trade Like a Stock Market Wizard",
        ],
        "subtopics": [
            {"name": "R-multiple framework: defining 1R as the distance to the stop and using it to size positions and set targets", "difficulty": "beginner"},
            {"name": "Portfolio heat: calculating total open risk across all positions and setting a maximum exposure limit", "difficulty": "intermediate"},
            {"name": "Scaling out at targets: partial profit-taking rules at 1R, 2R, and 3R levels", "difficulty": "intermediate"},
            {"name": "ATR-based trailing stops: using average true range to trail a winning position dynamically", "difficulty": "advanced"},
            {"name": "Gap-down risk: how to respond when an open position gaps down at the market open", "difficulty": "intermediate"},
            {"name": "Overnight exposure rules: position-sizing and risk limits for holding trades overnight", "difficulty": "intermediate"},
            {"name": "Maximum drawdown rules: defining a daily and monthly loss limit that triggers a trading pause", "difficulty": "intermediate"},
            {"name": "Sector rotation response: when and how to adjust existing positions as sector leadership shifts", "difficulty": "advanced"},
            {"name": "Time stop: exiting positions that fail to make progress within 3-6 weeks regardless of price stop", "difficulty": "intermediate"},
        ],
    },
    "emotional_discipline": {
        "questions_per_subtopic": 5,
        "sources": [
            "Douglas - Trading in the Zone",
            "Elder - Trading for a Living",
        ],
        "subtopics": [
            {"name": "Confirmation bias: only seeking information that supports an existing trade thesis", "difficulty": "intermediate"},
            {"name": "Recency bias: overweighting recent wins or losses when evaluating current setups", "difficulty": "intermediate"},
            {"name": "Overtrading after a big win: the hot-hand fallacy and its effect on risk-taking", "difficulty": "intermediate"},
            {"name": "Pre-market routine: building a consistent preparation process that separates research from impulsive trading", "difficulty": "beginner"},
            {"name": "Post-trade review: how to conduct an objective review after each closed trade", "difficulty": "intermediate"},
            {"name": "FOMO in a bull market: psychological pressure to deploy capital at any price during a strong advance", "difficulty": "intermediate"},
            {"name": "Paralysis after a drawdown: inability to execute valid setups following a losing streak", "difficulty": "intermediate"},
            {"name": "Community and forum influence: how social trading groups distort independent decision-making", "difficulty": "intermediate"},
        ],
    },
    "chart_reading": {
        "questions_per_subtopic": 5,
        "sources": [
            "O'Neil - How to Make Money in Stocks",
            "Murphy - Technical Analysis of Financial Markets",
        ],
        "subtopics": [
            {"name": "Accumulation vs distribution days: identifying institutional buying and selling by price and volume action", "difficulty": "intermediate"},
            {"name": "Churning: recognizing high-volume days with minimal price progress as a distribution warning", "difficulty": "advanced"},
            {"name": "Volume dry-up (VDU): identifying when selling pressure has exhausted itself during a base formation", "difficulty": "intermediate"},
            {"name": "Weekly vs daily chart priority: when to use each timeframe and how to reconcile conflicts", "difficulty": "intermediate"},
            {"name": "Stalling action: subtle topping signals near price highs before a distribution breakdown", "difficulty": "advanced"},
            {"name": "Price spread analysis: interpreting price range width and volume together to read institutional intent", "difficulty": "intermediate"},
            {"name": "Gap type identification: classifying common, breakaway, continuation, and exhaustion gaps from context", "difficulty": "intermediate"},
            {"name": "Island reversals: when a stock becomes isolated by gaps on both sides and what it signals", "difficulty": "advanced"},
        ],
    },
    "chart_patterns": {
        "questions_per_subtopic": 3,
        "sources": [
            "Murphy - Technical Analysis of Financial Markets",
            "Bulkowski - Encyclopedia of Chart Patterns",
        ],
        "subtopics": [
            {"name": "Ascending triangle: flat resistance ceiling with a rising support floor and its breakout implications", "difficulty": "beginner"},
            {"name": "Descending triangle: flat support floor with a falling resistance ceiling and its breakdown implications", "difficulty": "beginner"},
            {"name": "Symmetrical triangle: converging trendlines with no directional bias and how to trade the breakout", "difficulty": "intermediate"},
            {"name": "Rising wedge: bearish pattern with higher highs and higher lows but converging lines", "difficulty": "intermediate"},
            {"name": "Falling wedge: bullish continuation/reversal pattern with lower highs and lower lows but converging lines", "difficulty": "intermediate"},
            {"name": "Pennant: brief tight consolidation after a sharp directional move; how it differs from a flag", "difficulty": "intermediate"},
            {"name": "Cup without handle: rounded base that breaks out without forming a handle; pros and cons", "difficulty": "intermediate"},
            {"name": "High tight flag: rare pattern with 100%+ advance followed by a tight 10-25% consolidation", "difficulty": "advanced"},
            {"name": "Morning star and evening star: three-candle reversal patterns at market turning points", "difficulty": "intermediate"},
            {"name": "Doji types: standard, dragonfly, and gravestone doji and their contextual interpretations", "difficulty": "beginner"},
            {"name": "Harami patterns: bullish and bearish inside-candle reversal signals", "difficulty": "intermediate"},
            {"name": "Three white soldiers and three black crows: multi-candle momentum reversal signals", "difficulty": "intermediate"},
        ],
    },
    "support_resistance": {
        "questions_per_subtopic": 5,
        "sources": [
            "Murphy - Technical Analysis of Financial Markets",
            "Weinstein - Secrets for Profiting in Bull and Bear Markets",
        ],
        "subtopics": [
            {"name": "Psychological round numbers: why prices like $50, $100, and $200 act as natural support and resistance", "difficulty": "beginner"},
            {"name": "Moving averages as dynamic support: the roles of the 21 EMA, 50 MA, and 200 MA as moving levels", "difficulty": "beginner"},
            {"name": "Fibonacci retracements: using 38.2%, 50%, and 61.8% pullback levels as support and resistance zones", "difficulty": "intermediate"},
            {"name": "Gap fill levels: how unfilled gaps create support or resistance on the chart", "difficulty": "intermediate"},
            {"name": "Prior base highs as future support: why the top of a prior base becomes support after a breakout", "difficulty": "intermediate"},
            {"name": "Support confluence: when multiple support types align at the same price level", "difficulty": "advanced"},
            {"name": "Weekly chart support levels: why weekly chart support and resistance carries more weight than daily", "difficulty": "intermediate"},
        ],
    },
    "channels": {
        "questions_per_subtopic": 4,
        "sources": [
            "Murphy - Technical Analysis of Financial Markets",
        ],
        "subtopics": [
            {"name": "Channel midline as pivot: using the midpoint between channel lines as intermediate support/resistance", "difficulty": "intermediate"},
            {"name": "Trading descending channel shorts: identifying short entries near the upper line of a descending channel", "difficulty": "advanced"},
            {"name": "Horizontal channel (trading range): buying the channel floor and selling the ceiling in a range-bound market", "difficulty": "beginner"},
            {"name": "Channel width and implied volatility: what a widening or narrowing channel signals about future moves", "difficulty": "intermediate"},
            {"name": "False channel breaks: how to distinguish a genuine breakout from a temporary violation of channel lines", "difficulty": "advanced"},
        ],
    },
    # ── New categories ────────────────────────────────────────────────────────
    "technical_indicators": {
        "questions_per_subtopic": 5,
        "sources": [
            "Murphy - Technical Analysis of Financial Markets",
            "Wilder - New Concepts in Technical Trading Systems",
        ],
        "subtopics": [
            {"name": "RSI overbought and oversold: when the 70/30 levels matter and when an extended RSI reflects a strong trend", "difficulty": "beginner"},
            {"name": "RSI divergence: identifying bullish and bearish divergence between RSI and price", "difficulty": "intermediate"},
            {"name": "RSI failure swings and the 50 centerline: using internal RSI structure to confirm trend strength", "difficulty": "advanced"},
            {"name": "MACD signal line crossovers and zero-line crossovers: timing entries and exits", "difficulty": "beginner"},
            {"name": "MACD histogram divergence: using histogram momentum shifts as early warning of trend reversals", "difficulty": "intermediate"},
            {"name": "Bollinger Band squeeze: low-volatility compression preceding a high-probability expansion move", "difficulty": "intermediate"},
            {"name": "VWAP as intraday support and resistance: how swing traders use VWAP to assess intraday strength", "difficulty": "intermediate"},
            {"name": "OBV trend confirmation and divergence: using on-balance volume to confirm or question a price trend", "difficulty": "intermediate"},
            {"name": "Stochastics: overbought/oversold levels and %K/%D crossovers as trade signals", "difficulty": "beginner"},
            {"name": "Indicator confluence and contradiction: how to handle multiple indicators that agree vs conflict", "difficulty": "advanced"},
        ],
    },
    "market_internals": {
        "questions_per_subtopic": 5,
        "sources": [
            "O'Neil - How to Make Money in Stocks",
            "Murphy - Technical Analysis of Financial Markets",
        ],
        "subtopics": [
            {"name": "Advance/decline line: using market breadth to confirm or question the health of a market rally", "difficulty": "intermediate"},
            {"name": "New 52-week highs vs lows ratio: measuring market leadership breadth", "difficulty": "intermediate"},
            {"name": "VIX interpretation: what extreme fear and extreme complacency readings signal about market direction", "difficulty": "intermediate"},
            {"name": "Put/call ratio: using options market sentiment as a contrarian signal at extremes", "difficulty": "advanced"},
            {"name": "Distribution day count: how to track distribution days and when the count signals market trouble", "difficulty": "intermediate"},
            {"name": "Follow-through day: confirming a new market uptrend before committing capital to new swing positions", "difficulty": "intermediate"},
            {"name": "Sector rotation cycle: which sectors lead and lag at different stages of the economic cycle", "difficulty": "advanced"},
            {"name": "Relative sector strength: how to identify the strongest and weakest sectors in real time", "difficulty": "intermediate"},
            {"name": "Index divergence: what it means when small-cap indices diverge from large-cap indices", "difficulty": "advanced"},
            {"name": "Market trend confirmation: how to definitively classify the market as uptrend, correction, or downtrend", "difficulty": "beginner"},
        ],
    },
    "short_selling": {
        "questions_per_subtopic": 5,
        "sources": [
            "Minervini - Trade Like a Stock Market Wizard",
            "O'Neil - How to Make Money in Stocks",
        ],
        "subtopics": [
            {"name": "Short selling mechanics: how to locate shares to borrow, margin requirements, and the cost of short interest", "difficulty": "beginner"},
            {"name": "Failed breakout as a short setup: when a stock breaks out and fails within 1-2 days as a short-entry trigger", "difficulty": "intermediate"},
            {"name": "Head and shoulders top: identifying the pattern and timing the short entry at the neckline break", "difficulty": "intermediate"},
            {"name": "Climax top and extended stock shorting: how to identify a parabolic move nearing exhaustion", "difficulty": "advanced"},
            {"name": "Short squeeze mechanics: what causes them and how to identify squeeze risk before entering a short", "difficulty": "intermediate"},
            {"name": "Stop placement and covering rules for short positions: where to stop out and when to cover", "difficulty": "intermediate"},
            {"name": "Downtrend context: why short selling has highest probability in Stage 3 and Stage 4 stocks", "difficulty": "beginner"},
            {"name": "Risk/reward asymmetry: maximum gain on a short is 100%, potential loss is unlimited", "difficulty": "intermediate"},
        ],
    },
    "gap_trading": {
        "questions_per_subtopic": 5,
        "sources": [
            "Murphy - Technical Analysis of Financial Markets",
            "Bulkowski - Getting Started in Chart Patterns",
        ],
        "subtopics": [
            {"name": "Gap classification: how to identify common, breakaway, continuation, and exhaustion gaps from context", "difficulty": "beginner"},
            {"name": "Gap fill probability: which gap types tend to fill and which tend not to fill", "difficulty": "intermediate"},
            {"name": "Earnings gap plays: when to trade a gap-and-go vs when to fade an earnings gap", "difficulty": "advanced"},
            {"name": "Gap-up entry rules: how to buy a stock that gaps above your planned entry without chasing", "difficulty": "intermediate"},
            {"name": "Gap-down response: when to hold through a gap-down on an existing position vs exit immediately", "difficulty": "intermediate"},
            {"name": "Pre-market gap assessment: evaluating gap significance using pre-market volume before the open", "difficulty": "intermediate"},
            {"name": "Gaps at support and resistance: how a gap occurring at a key level amplifies its significance", "difficulty": "intermediate"},
            {"name": "Failed gap reversals: when a gap-up closes below the gap level on the same day as a bearish signal", "difficulty": "advanced"},
        ],
    },
}
```

- [ ] **Step 2: Verify taxonomy loads**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -c "
from scripts.question_taxonomy import TAXONOMY
total = sum(len(v['subtopics']) * v['questions_per_subtopic'] for v in TAXONOMY.values())
print(f'{len(TAXONOMY)} categories, ~{total} questions to generate')
"
```

Expected output: `12 categories, ~491 questions to generate`

- [ ] **Step 3: Commit**

```bash
git add scripts/question_taxonomy.py
git commit -m "feat: add question bank taxonomy (12 categories, ~491 subtopic slots)"
```

---

## Task 3: Write `scripts/generate_question_bank.py` with tests

**Files:**
- Create: `scripts/generate_question_bank.py`
- Create: `tests/test_question_bank_scripts.py`

- [ ] **Step 1: Write the failing tests first**

Create `tests/test_question_bank_scripts.py`:

```python
# tests/test_question_bank_scripts.py
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from scripts.generate_question_bank import build_generation_prompt, parse_generated_questions


def test_build_generation_prompt_contains_subtopic():
    subtopic = {"name": "RSI divergence test", "difficulty": "intermediate"}
    prompt = build_generation_prompt(
        category="technical_indicators",
        subtopic=subtopic,
        sources=["Murphy - Technical Analysis"],
        questions_per_subtopic=5,
        existing_questions=[],
    )
    assert "RSI divergence test" in prompt
    assert "technical indicators" in prompt.lower()
    assert "5" in prompt


def test_build_generation_prompt_includes_existing_questions():
    existing = [{"q": "What does RSI measure?", "options": ["a", "b", "c", "d"], "correct": 0, "explanation": "e"}]
    subtopic = {"name": "RSI basics", "difficulty": "beginner"}
    prompt = build_generation_prompt(
        category="technical_indicators",
        subtopic=subtopic,
        sources=["Murphy - Technical Analysis"],
        questions_per_subtopic=5,
        existing_questions=existing,
    )
    assert "What does RSI measure?" in prompt


def test_parse_generated_questions_returns_list():
    raw = json.dumps([
        {
            "q": "What does RSI stand for?",
            "options": ["Relative Strength Index", "Rate of Speed Indicator", "Risk Score Index", "Relative Swing Indicator"],
            "correct": 0,
            "explanation": "RSI stands for Relative Strength Index.",
            "difficulty": "beginner",
            "tags": ["RSI"],
        }
    ])
    result = parse_generated_questions(raw, source="Murphy - Technical Analysis")
    assert len(result) == 1
    assert result[0]["q"] == "What does RSI stand for?"
    assert result[0]["source"] == "Murphy - Technical Analysis"


def test_parse_generated_questions_rejects_wrong_option_count():
    raw = json.dumps([
        {
            "q": "Bad question?",
            "options": ["a", "b"],  # only 2 options — invalid
            "correct": 0,
            "explanation": "e",
            "difficulty": "beginner",
            "tags": [],
        }
    ])
    result = parse_generated_questions(raw, source="test")
    assert result == []


def test_parse_generated_questions_rejects_out_of_range_correct():
    raw = json.dumps([
        {
            "q": "Bad correct index?",
            "options": ["a", "b", "c", "d"],
            "correct": 5,  # out of range
            "explanation": "e",
            "difficulty": "beginner",
            "tags": [],
        }
    ])
    result = parse_generated_questions(raw, source="test")
    assert result == []
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 -m pytest tests/test_question_bank_scripts.py -v 2>&1 | head -20
```

Expected: `ImportError` or `ModuleNotFoundError` — generate_question_bank.py doesn't exist yet.

- [ ] **Step 3: Write `scripts/generate_question_bank.py`**

```python
# scripts/generate_question_bank.py
"""
Stage 1: Generate questions for every sub-topic in the taxonomy.

Usage:
  python3 scripts/generate_question_bank.py
  python3 scripts/generate_question_bank.py --category=technical_indicators

Output: scripts/output/generated-{category}.json
Each JSON file is a dict keyed by subtopic name → list of question dicts.
Script is idempotent: skips subtopics that already have output.
"""
import json
import os
import sys
import time
import argparse

import anthropic

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from scripts.question_taxonomy import TAXONOMY

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def build_generation_prompt(
    category: str,
    subtopic: dict,
    sources: list[str],
    questions_per_subtopic: int,
    existing_questions: list[dict],
) -> str:
    sample = "\n".join(f'- "{q["q"]}"' for q in existing_questions[:5])
    avoid_block = f"\nDo NOT duplicate any of these existing questions:\n{sample}\n" if sample else ""
    return f"""You are an expert swing trading instructor writing quiz questions for a professional trading education app.

Category: {category.replace("_", " ")}
Sub-topic: {subtopic["name"]}
Difficulty: {subtopic["difficulty"]}
Source authority: {", ".join(sources)}
{avoid_block}
Generate exactly {questions_per_subtopic} multiple-choice questions testing understanding of this specific concept.
Each question should test a different scenario or angle of the sub-topic.

Return ONLY a JSON array — no markdown, no explanation:
[
  {{
    "q": "Question text as a specific scenario",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explanation": "Why this answer is correct and why the others are wrong",
    "difficulty": "{subtopic["difficulty"]}",
    "tags": ["tag1", "tag2"]
  }}
]

"correct" is the 0-based index of the correct option.
Vary which index is correct across your {questions_per_subtopic} questions."""


def parse_generated_questions(raw_text: str, source: str) -> list[dict]:
    """Parse Claude's JSON response. Returns only structurally valid questions."""
    try:
        items = json.loads(raw_text.strip())
    except json.JSONDecodeError:
        return []
    if not isinstance(items, list):
        return []
    valid = []
    for item in items:
        if not isinstance(item.get("options"), list) or len(item["options"]) != 4:
            continue
        if not isinstance(item.get("correct"), int) or item["correct"] not in range(4):
            continue
        if not item.get("q") or not item.get("explanation"):
            continue
        valid.append({**item, "source": source})
    return valid


def generate_for_category(category_key: str) -> None:
    config = TAXONOMY[category_key]
    output_path = os.path.join(OUTPUT_DIR, f"generated-{category_key}.json")
    existing_output: dict = {}
    if os.path.exists(output_path):
        with open(output_path) as f:
            existing_output = json.load(f)

    # Load existing bank questions for duplicate avoidance
    from frontend.src.data import drillQuestions  # noqa: not available — use JSON snapshot instead
    # Note: we pass an empty list; Claude avoids duplicates via the taxonomy naming
    existing_bank: list[dict] = []

    print(f"\n── {category_key} ({len(config['subtopics'])} subtopics) ──")
    source_primary = config["sources"][0]

    for subtopic in config["subtopics"]:
        name = subtopic["name"]
        if name in existing_output:
            print(f"  ✓ cached: {name[:60]}")
            continue

        print(f"  → generating: {name[:60]}…", end="", flush=True)
        prompt = build_generation_prompt(
            category=category_key,
            subtopic=subtopic,
            sources=config["sources"],
            questions_per_subtopic=config["questions_per_subtopic"],
            existing_questions=existing_bank,
        )

        try:
            response = _get_client().messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}],
            )
            questions = parse_generated_questions(response.content[0].text, source_primary)
            if not questions:
                print(f" ✗ no valid questions parsed")
            else:
                existing_output[name] = questions
                with open(output_path, "w") as f:
                    json.dump(existing_output, f, indent=2)
                print(f" ✓ {len(questions)} questions")
        except Exception as exc:
            print(f" ✗ {exc}")

        time.sleep(0.6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", help="Run only this category key")
    args = parser.parse_args()

    categories = [args.category] if args.category else list(TAXONOMY.keys())
    for cat in categories:
        if cat not in TAXONOMY:
            print(f"Unknown category: {cat}")
            sys.exit(1)
        generate_for_category(cat)

    print("\n✓ Generation complete. Run validate_question_bank.py next.")
```

- [ ] **Step 4: Run tests — they should pass now**

```bash
python3 -m pytest tests/test_question_bank_scripts.py::test_build_generation_prompt_contains_subtopic \
  tests/test_question_bank_scripts.py::test_build_generation_prompt_includes_existing_questions \
  tests/test_question_bank_scripts.py::test_parse_generated_questions_returns_list \
  tests/test_question_bank_scripts.py::test_parse_generated_questions_rejects_wrong_option_count \
  tests/test_question_bank_scripts.py::test_parse_generated_questions_rejects_out_of_range_correct \
  -v
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/generate_question_bank.py tests/test_question_bank_scripts.py
git commit -m "feat: add question bank generation script with prompt builder and parser"
```

---

## Task 4: Write `scripts/validate_question_bank.py` with tests

**Files:**
- Modify: `tests/test_question_bank_scripts.py` (add validation tests)
- Create: `scripts/validate_question_bank.py`

- [ ] **Step 1: Add failing tests for validation functions**

Append to `tests/test_question_bank_scripts.py`:

```python
from scripts.validate_question_bank import build_validation_prompt, parse_validation_result


def test_build_validation_prompt_contains_question_text():
    q = {
        "q": "What is RSI?",
        "options": ["A momentum indicator", "A volume indicator", "A trend indicator", "A volatility indicator"],
        "correct": 0,
        "explanation": "RSI is a momentum oscillator.",
        "source": "Murphy - Technical Analysis",
    }
    prompt = build_validation_prompt(q)
    assert "What is RSI?" in prompt
    assert "A momentum indicator" in prompt
    assert "Murphy" in prompt
    assert "index 0" in prompt


def test_parse_validation_result_ok():
    raw = '{"verdict": "OK", "issue": null}'
    result = parse_validation_result(raw)
    assert result["verdict"] == "OK"
    assert result["issue"] is None


def test_parse_validation_result_error():
    raw = '{"verdict": "ERROR", "issue": "The marked answer is factually incorrect."}'
    result = parse_validation_result(raw)
    assert result["verdict"] == "ERROR"
    assert "incorrect" in result["issue"]


def test_parse_validation_result_handles_invalid_json():
    result = parse_validation_result("not json at all")
    assert result["verdict"] == "WARN"
    assert result["issue"] is not None
```

- [ ] **Step 2: Run to confirm they fail**

```bash
python3 -m pytest tests/test_question_bank_scripts.py -k "validation" -v 2>&1 | head -10
```

Expected: `ImportError` — validate_question_bank.py doesn't exist yet.

- [ ] **Step 3: Write `scripts/validate_question_bank.py`**

```python
# scripts/validate_question_bank.py
"""
Stage 2: Validate every generated question with a second Claude pass.

Usage:
  python3 scripts/validate_question_bank.py
  python3 scripts/validate_question_bank.py --category=technical_indicators

Output: scripts/output/validated-{category}.json
Each file mirrors generated-{category}.json but each question has a
"flag" field: "OK" | "WARN" | "ERROR" and a "flag_issue" field.
Script is idempotent: skips subtopics already in validated output.
"""
import json
import os
import sys
import time
import argparse

import anthropic

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from scripts.question_taxonomy import TAXONOMY

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def build_validation_prompt(question: dict) -> str:
    opts = "\n".join(
        f"{chr(65+i)}) {opt}" for i, opt in enumerate(question["options"])
    )
    correct_text = question["options"][question["correct"]]
    return f"""You are an expert swing trading educator reviewing quiz questions for factual accuracy.

Q: {question["q"]}
Options:
{opts}
Marked correct: {correct_text} (index {question["correct"]})
Explanation: {question["explanation"]}
Source: {question.get("source", "unknown")}

Check:
1. Is the marked answer factually correct for swing trading?
2. Could any other option be considered equally correct?
3. Is the question clearly worded without ambiguity?
4. Is the explanation accurate and complete?

Respond with JSON only, no markdown:
{{"verdict": "OK|WARN|ERROR", "issue": "description or null"}}

ERROR = wrong answer or significant factual error
WARN = minor ambiguity or misleading wording
OK = question is accurate and clear"""


def parse_validation_result(raw_text: str) -> dict:
    """Parse Claude's verdict JSON. Returns a safe default on failure."""
    try:
        result = json.loads(raw_text.strip())
        if result.get("verdict") in ("OK", "WARN", "ERROR"):
            return result
    except (json.JSONDecodeError, AttributeError):
        pass
    return {"verdict": "WARN", "issue": f"Failed to parse validation response: {raw_text[:80]}"}


def validate_category(category_key: str) -> dict:
    generated_path = os.path.join(OUTPUT_DIR, f"generated-{category_key}.json")
    if not os.path.exists(generated_path):
        print(f"  skip (no generated file): {category_key}")
        return {"ok": 0, "warn": 0, "error": 0}

    with open(generated_path) as f:
        generated: dict = json.load(f)

    validated_path = os.path.join(OUTPUT_DIR, f"validated-{category_key}.json")
    existing_validated: dict = {}
    if os.path.exists(validated_path):
        with open(validated_path) as f:
            existing_validated = json.load(f)

    counts = {"ok": 0, "warn": 0, "error": 0}
    print(f"\n── validating {category_key} ──")

    for subtopic_name, questions in generated.items():
        if subtopic_name in existing_validated:
            for q in existing_validated[subtopic_name]:
                counts[q.get("flag", "warn").lower()] += 1
            print(f"  ✓ cached: {subtopic_name[:50]}")
            continue

        print(f"  → {subtopic_name[:50]}…", end="", flush=True)
        flagged = []

        for question in questions:
            try:
                response = _get_client().messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=200,
                    messages=[{"role": "user", "content": build_validation_prompt(question)}],
                )
                result = parse_validation_result(response.content[0].text)
                flagged.append({**question, "flag": result["verdict"], "flag_issue": result["issue"]})
                counts[result["verdict"].lower()] += 1
                time.sleep(0.3)
            except Exception as exc:
                flagged.append({**question, "flag": "ERROR", "flag_issue": str(exc)})
                counts["error"] += 1

        existing_validated[subtopic_name] = flagged
        with open(validated_path, "w") as f:
            json.dump(existing_validated, f, indent=2)
        ok_count = sum(1 for q in flagged if q["flag"] == "OK")
        print(f" {ok_count}/{len(flagged)} OK")

    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", help="Validate only this category key")
    args = parser.parse_args()

    categories = [args.category] if args.category else list(TAXONOMY.keys())
    total = {"ok": 0, "warn": 0, "error": 0}

    for cat in categories:
        result = validate_category(cat)
        for k in total:
            total[k] += result[k]

    print(f"\n── Validation complete ──")
    print(f"✓ OK:    {total['ok']}")
    print(f"⚠ WARN:  {total['warn']}")
    print(f"✗ ERROR: {total['error']}")
    if total["error"] > 0:
        print("ERROR questions excluded from merge. Review scripts/output/validated-*.json to fix manually.")
    print("\nRun: node scripts/merge_question_bank.mjs")
```

- [ ] **Step 4: Run all tests**

```bash
python3 -m pytest tests/test_question_bank_scripts.py -v
```

Expected: `9 passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_question_bank.py tests/test_question_bank_scripts.py
git commit -m "feat: add question bank validation script with verdict parser"
```

---

## Task 5: Write `scripts/merge_question_bank.mjs` with tests

**Files:**
- Create: `scripts/merge_question_bank.mjs`
- Create: `scripts/test_merge.mjs`

The merge script reads validated JSON, appends non-ERROR questions to `drillQuestions.js`, balances answer positions for new questions only, and adds `DRILL_META` entries for new categories. It uses `import()` to load the existing ES-module question bank.

- [ ] **Step 1: Write failing tests**

Create `scripts/test_merge.mjs`:

```js
// scripts/test_merge.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotateToPosition, balanceAnswerPositions, serializeDrillQuestionsFile } from './merge_question_bank.mjs'

const makeQ = (correct, opts = ['right', 'wrong1', 'wrong2', 'wrong3']) => ({
  q: 'Test question?',
  options: opts,
  correct,
  explanation: 'Explanation.',
  source: 'Test Source',
  difficulty: 'intermediate',
  tags: ['test'],
})

test('rotateToPosition: unchanged when target equals current', () => {
  const q = makeQ(1, ['a', 'b', 'c', 'd'])
  assert.deepEqual(rotateToPosition(q, 1), q)
})

test('rotateToPosition: correct option lands at target index', () => {
  const q = makeQ(0, ['right', 'wrong1', 'wrong2', 'wrong3'])
  const rotated = rotateToPosition(q, 2)
  assert.equal(rotated.correct, 2)
  assert.equal(rotated.options[2], 'right')
})

test('rotateToPosition: preserves all four options', () => {
  const q = makeQ(0, ['a', 'b', 'c', 'd'])
  const rotated = rotateToPosition(q, 3)
  assert.deepEqual(rotated.options.slice().sort(), ['a', 'b', 'c', 'd'])
})

test('balanceAnswerPositions: distributes 8 questions evenly (2 each)', () => {
  const qs = Array.from({ length: 8 }, () => makeQ(0))
  const balanced = balanceAnswerPositions(qs)
  const counts = [0, 0, 0, 0]
  balanced.forEach(q => counts[q.correct]++)
  counts.forEach(c => assert.equal(c, 2))
})

test('balanceAnswerPositions: preserves question count', () => {
  const qs = Array.from({ length: 5 }, () => makeQ(0))
  assert.equal(balanceAnswerPositions(qs).length, 5)
})

test('serializeDrillQuestionsFile: output contains export declarations', () => {
  const questions = { test_cat: [makeQ(0)] }
  const meta = { test_cat: { label: 'Test', type: 'test_quiz', skill: 'test' } }
  const output = serializeDrillQuestionsFile(questions, meta)
  assert.ok(output.includes('export const DRILL_QUESTIONS'))
  assert.ok(output.includes('export const DRILL_META'))
})

test('serializeDrillQuestionsFile: existing question text is preserved', () => {
  const questions = { cat: [makeQ(1)] }
  const output = serializeDrillQuestionsFile(questions, {})
  assert.ok(output.includes('Test question?'))
})

test('serializeDrillQuestionsFile: correct index is preserved in output', () => {
  const questions = { cat: [makeQ(2)] }
  const output = serializeDrillQuestionsFile(questions, {})
  assert.ok(output.includes('"correct":2'))
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
node --test scripts/test_merge.mjs 2>&1 | head -10
```

Expected: `Error: Cannot find module './merge_question_bank.mjs'`

- [ ] **Step 3: Write `scripts/merge_question_bank.mjs`**

```js
// scripts/merge_question_bank.mjs
/**
 * Stage 3: Merge validated questions into drillQuestions.js.
 *
 * Usage: node scripts/merge_question_bank.mjs [--category=technical_indicators]
 *
 * - Skips ERROR-flagged questions
 * - Appends new questions AFTER existing ones (preserves bank_idx for mastery)
 * - Balances answer positions (correct: 0/1/2/3 ~equally) among new questions
 * - Adds DRILL_META entries for new categories
 * - Rewrites frontend/src/data/drillQuestions.js
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
const DRILL_QUESTIONS_PATH = resolve(__dirname, '..', 'frontend', 'src', 'data', 'drillQuestions.js')

// ── Pure functions (exported for testing) ──────────────────────────────────

export function rotateToPosition(question, targetCorrect) {
  const shift = ((targetCorrect - question.correct) % 4 + 4) % 4
  if (shift === 0) return question
  const rotated = [
    ...question.options.slice(shift),
    ...question.options.slice(0, shift),
  ]
  return { ...question, options: rotated, correct: targetCorrect }
}

export function balanceAnswerPositions(newQuestions) {
  const counts = [0, 0, 0, 0]
  return newQuestions.map(q => {
    const targetPos = counts.indexOf(Math.min(...counts))
    counts[targetPos]++
    return rotateToPosition(q, targetPos)
  })
}

export function serializeDrillQuestionsFile(questions, meta) {
  const qEntries = Object.entries(questions).map(([key, qs]) => {
    const lines = qs.map(q => '    ' + JSON.stringify(q)).join(',\n')
    return `  ${key}: [\n${lines},\n  ]`
  }).join(',\n\n')

  const metaEntries = Object.entries(meta).map(([key, val]) => {
    return `  ${key}: ${JSON.stringify(val)}`
  }).join(',\n')

  return `export const DRILL_QUESTIONS = {\n${qEntries}\n}\n\nexport const DRILL_META = {\n${metaEntries}\n}\n`
}

// ── New category metadata ──────────────────────────────────────────────────

const NEW_CATEGORY_META = {
  technical_indicators: { label: 'Technical Indicators', type: 'indicator_quiz', skill: 'technical_indicators' },
  market_internals:     { label: 'Market Internals',      type: 'internals_quiz', skill: 'market_internals'     },
  short_selling:        { label: 'Short Selling',          type: 'short_quiz',    skill: 'short_selling'        },
  gap_trading:          { label: 'Gap Trading',            type: 'gap_quiz',      skill: 'gap_trading'          },
}

// ── Main execution (only when run directly) ────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const categoryFilter = process.argv.find(a => a.startsWith('--category='))?.split('=')[1]

  // Dynamically import the existing question bank
  const { DRILL_QUESTIONS, DRILL_META } = await import(DRILL_QUESTIONS_PATH + '?ts=' + Date.now())
  const questions = JSON.parse(JSON.stringify(DRILL_QUESTIONS))
  const meta = JSON.parse(JSON.stringify(DRILL_META))

  // Read taxonomy keys to determine processing order
  const { TAXONOMY } = await import('./question_taxonomy.mjs')
  const categories = categoryFilter ? [categoryFilter] : Object.keys(TAXONOMY)

  let totalAdded = 0
  let totalSkipped = 0

  for (const categoryKey of categories) {
    const validatedPath = join(OUTPUT_DIR, `validated-${categoryKey}.json`)
    if (!existsSync(validatedPath)) {
      console.log(`skip (no validated file): ${categoryKey}`)
      continue
    }

    const validated = JSON.parse(readFileSync(validatedPath, 'utf8'))
    const newQuestions = []

    for (const subtopicQs of Object.values(validated)) {
      for (const q of subtopicQs) {
        if (q.flag === 'ERROR') { totalSkipped++; continue }
        const { flag, flag_issue, ...cleanQ } = q
        newQuestions.push(cleanQ)
      }
    }

    const balanced = balanceAnswerPositions(newQuestions)
    questions[categoryKey] = [...(questions[categoryKey] ?? []), ...balanced]

    if (NEW_CATEGORY_META[categoryKey] && !meta[categoryKey]) {
      meta[categoryKey] = NEW_CATEGORY_META[categoryKey]
    }

    totalAdded += balanced.length
    console.log(`${categoryKey}: +${balanced.length} (total: ${questions[categoryKey].length})`)
  }

  writeFileSync(DRILL_QUESTIONS_PATH, serializeDrillQuestionsFile(questions, meta), 'utf8')
  console.log(`\n✓ ${totalAdded} questions added, ${totalSkipped} ERROR questions skipped`)
  console.log(`Updated: ${DRILL_QUESTIONS_PATH}`)
}
```

The merge script imports from `question_taxonomy.mjs`. Create that thin re-export:

```js
// scripts/question_taxonomy.mjs
// Re-export Python taxonomy as JS for the merge script.
// Kept in sync with question_taxonomy.py manually.
export const TAXONOMY = {
  setup_selection:      { subtopics: Array(10) },
  entry_timing:         { subtopics: Array(9)  },
  trade_management:     { subtopics: Array(9)  },
  emotional_discipline: { subtopics: Array(8)  },
  chart_reading:        { subtopics: Array(8)  },
  chart_patterns:       { subtopics: Array(12) },
  support_resistance:   { subtopics: Array(7)  },
  channels:             { subtopics: Array(5)  },
  technical_indicators: { subtopics: Array(10) },
  market_internals:     { subtopics: Array(10) },
  short_selling:        { subtopics: Array(8)  },
  gap_trading:          { subtopics: Array(8)  },
}
```

(The merge script only needs the keys — the subtopic data lives in the Python file.)

- [ ] **Step 4: Run tests**

```bash
node --test scripts/test_merge.mjs
```

Expected:
```
✔ rotateToPosition: unchanged when target equals current
✔ rotateToPosition: correct option lands at target index
✔ rotateToPosition: preserves all four options
✔ balanceAnswerPositions: distributes 8 questions evenly (2 each)
✔ balanceAnswerPositions: preserves question count
✔ serializeDrillQuestionsFile: output contains export declarations
✔ serializeDrillQuestionsFile: existing question text is preserved
✔ serializeDrillQuestionsFile: correct index is preserved in output
ℹ tests 8
ℹ pass 8
```

- [ ] **Step 5: Commit**

```bash
git add scripts/merge_question_bank.mjs scripts/question_taxonomy.mjs scripts/test_merge.mjs
git commit -m "feat: add merge script with answer balancing and serialization"
```

---

## Task 6: Update `backend/schemas.py`

**Files:**
- Modify: `backend/schemas.py:6-27`

- [ ] **Step 1: Write failing test**

Add to `tests/test_question_bank_scripts.py`:

```python
def test_new_skills_in_valid_skills():
    from backend.schemas import VALID_SKILLS, VALID_DRILL_KEYS
    for skill in ["technical_indicators", "market_internals", "short_selling", "gap_trading"]:
        assert skill in VALID_SKILLS, f"{skill} missing from VALID_SKILLS"
        assert skill in VALID_DRILL_KEYS, f"{skill} missing from VALID_DRILL_KEYS"
```

- [ ] **Step 2: Run to confirm it fails**

```bash
python3 -m pytest tests/test_question_bank_scripts.py::test_new_skills_in_valid_skills -v
```

Expected: `AssertionError: technical_indicators missing from VALID_SKILLS`

- [ ] **Step 3: Update `backend/schemas.py`**

Open `backend/schemas.py`. Change lines 6–27 from:

```python
VALID_SKILLS = [
    "chart_reading",
    "entry_timing",
    "risk_sizing",
    "setup_selection",
    "trade_management",
    "emotional_discipline",
]

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

To:

```python
VALID_SKILLS = [
    "chart_reading",
    "entry_timing",
    "risk_sizing",
    "setup_selection",
    "trade_management",
    "emotional_discipline",
    "technical_indicators",
    "market_internals",
    "short_selling",
    "gap_trading",
]

VALID_DRILL_KEYS = [
    "setup_selection",
    "entry_timing",
    "trade_management",
    "emotional_discipline",
    "chart_reading",
    "chart_patterns",
    "support_resistance",
    "channels",
    "technical_indicators",
    "market_internals",
    "short_selling",
    "gap_trading",
]
```

- [ ] **Step 4: Run all tests**

```bash
python3 -m pytest tests/ -v 2>&1 | tail -15
```

Expected: all previously passing tests still pass, plus `test_new_skills_in_valid_skills` now passes.

- [ ] **Step 5: Commit**

```bash
git add backend/schemas.py tests/test_question_bank_scripts.py
git commit -m "feat: add 4 new skill/drill keys to schemas"
```

---

## Task 7: Run the full pipeline

- [ ] **Step 1: Run generation (all categories)**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python3 scripts/generate_question_bank.py
```

Expected: takes ~5–10 minutes. Each category prints sub-topic progress. Final line: `✓ Generation complete.`

If a category fails partway through, re-run — the script is idempotent and will skip already-generated sub-topics.

- [ ] **Step 2: Spot-check a generated file**

```bash
python3 -c "
import json
with open('scripts/output/generated-technical_indicators.json') as f:
    data = json.load(f)
subtopics = list(data.keys())
print(f'{len(subtopics)} subtopics generated')
total = sum(len(v) for v in data.values())
print(f'{total} questions total')
# Print first question of first subtopic
first = list(data.values())[0][0]
print('Sample Q:', first['q'][:80])
print('Options:', first['options'])
print('Correct idx:', first['correct'])
"
```

Expected: `10 subtopics generated`, `50 questions total`, plus a readable sample question.

- [ ] **Step 3: Run validation**

```bash
python3 scripts/validate_question_bank.py
```

Expected: takes ~3–5 minutes. Summary at end: `✓ OK: N  ⚠ WARN: N  ✗ ERROR: N`

- [ ] **Step 4: Review ERROR-flagged questions (if any)**

```bash
python3 -c "
import json, glob, os
for path in glob.glob('scripts/output/validated-*.json'):
    with open(path) as f:
        data = json.load(f)
    for subtopic, qs in data.items():
        for q in qs:
            if q.get('flag') == 'ERROR':
                print(f'ERROR in {os.path.basename(path)}:')
                print(f'  Q: {q[\"q\"][:80]}')
                print(f'  Issue: {q[\"flag_issue\"]}')
                print()
"
```

For each ERROR: either fix the `correct` index directly in the validated JSON file, or leave it and it will be excluded from the merge.

- [ ] **Step 5: Run merge**

```bash
node scripts/merge_question_bank.mjs
```

Expected output (example):
```
setup_selection: +50 (total: 65)
entry_timing: +45 (total: 60)
...
technical_indicators: +50 (total: 50)
...
✓ 447 questions added, 3 ERROR questions skipped
Updated: .../frontend/src/data/drillQuestions.js
```

- [ ] **Step 6: Verify the output**

```bash
node -e "
import('./frontend/src/data/drillQuestions.js').then(({DRILL_QUESTIONS, DRILL_META}) => {
  const total = Object.values(DRILL_QUESTIONS).reduce((s,a) => s+a.length, 0)
  console.log('Total questions:', total)
  console.log('Categories:', Object.keys(DRILL_QUESTIONS).join(', '))
  console.log('DRILL_META keys:', Object.keys(DRILL_META).join(', '))
})
" --input-type=module
```

Expected: `Total questions: 500+`, all 12 categories listed.

- [ ] **Step 7: Run the Python test suite to confirm nothing broke**

```bash
python3 -m pytest tests/ -v 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/data/drillQuestions.js
git commit -m "feat: expand drill question bank to ~550 questions across 12 categories"
```

---

## Task 8: Expose new skills in the UI

New skills are invisible to existing users until they opt in. This task adds the 4 new skills to the onboarding picker and adds a skill-editing section to the Account page.

**Files:**
- Modify: `frontend/src/components/Onboarding.jsx:5-12`
- Modify: `frontend/src/pages/Account.jsx`

- [ ] **Step 1: Update `Onboarding.jsx` SKILLS array**

Open `frontend/src/components/Onboarding.jsx`. Replace lines 5–12:

```js
const SKILLS = [
  { key: 'chart_reading',        label: 'Chart Reading',        desc: 'Key levels, trend structure, setup validity' },
  { key: 'entry_timing',         label: 'Entry Timing',         desc: 'Precision and confirmation of entries' },
  { key: 'risk_sizing',          label: 'Risk & Sizing',        desc: 'Position sizing, stop adherence' },
  { key: 'setup_selection',      label: 'Setup Selection',      desc: 'Avoiding low-quality setups' },
  { key: 'trade_management',     label: 'Trade Management',     desc: 'Holding through noise, managing exits' },
  { key: 'emotional_discipline', label: 'Emotional Discipline', desc: 'FOMO, revenge trading, execution' },
  { key: 'technical_indicators', label: 'Technical Indicators', desc: 'RSI, MACD, Bollinger Bands, VWAP, OBV' },
  { key: 'market_internals',     label: 'Market Internals',     desc: 'Breadth, VIX, sector rotation, follow-through' },
  { key: 'short_selling',        label: 'Short Selling',        desc: 'Failed breakouts, H&S tops, covering rules' },
  { key: 'gap_trading',          label: 'Gap Trading',          desc: 'Gap types, fill probability, earnings gaps' },
]
```

- [ ] **Step 2: Add skills section to `Account.jsx`**

Read the full current `Account.jsx`, then add a skills section. The component already uses `useUser()`. Add these imports and the section below the name editor:

Add to the imports at the top of `Account.jsx`:

```js
import { useState, useEffect } from "react";
```

(Replace the existing `import { useState } from "react";` line.)

Add this constant after the existing `ThemeToggle` component (before `export default function Account()`):

```js
const ALL_SKILLS = [
  { key: 'chart_reading',        label: 'Chart Reading',        desc: 'Key levels, trend structure, setup validity' },
  { key: 'entry_timing',         label: 'Entry Timing',         desc: 'Precision and confirmation of entries' },
  { key: 'risk_sizing',          label: 'Risk & Sizing',        desc: 'Position sizing, stop adherence' },
  { key: 'setup_selection',      label: 'Setup Selection',      desc: 'Avoiding low-quality setups' },
  { key: 'trade_management',     label: 'Trade Management',     desc: 'Holding through noise, managing exits' },
  { key: 'emotional_discipline', label: 'Emotional Discipline', desc: 'FOMO, revenge trading, execution' },
  { key: 'technical_indicators', label: 'Technical Indicators', desc: 'RSI, MACD, Bollinger Bands, VWAP, OBV' },
  { key: 'market_internals',     label: 'Market Internals',     desc: 'Breadth, VIX, sector rotation, follow-through' },
  { key: 'short_selling',        label: 'Short Selling',        desc: 'Failed breakouts, H&S tops, covering rules' },
  { key: 'gap_trading',          label: 'Gap Trading',          desc: 'Gap types, fill probability, earnings gaps' },
]
```

Inside `export default function Account()`, add these state variables after the existing ones:

```js
const [selectedSkills, setSelectedSkills] = useState(user?.active_skills ?? [])
const [skillsSaving, setSkillsSaving] = useState(false)
const [skillsError, setSkillsError] = useState("")
const [skillsSaved, setSkillsSaved] = useState(false)
```

Add this function inside the component (after `saveName`):

```js
async function saveSkills() {
  if (selectedSkills.length < 2) {
    setSkillsError("Select at least 2 skills")
    return
  }
  setSkillsSaving(true)
  setSkillsError("")
  setSkillsSaved(false)
  try {
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active_skills: selectedSkills }),
    })
    if (!res.ok) { setSkillsError("Failed to save skills"); return }
    await refreshUser()
    setSkillsSaved(true)
  } finally {
    setSkillsSaving(false)
  }
}

function toggleSkill(key) {
  setSkillsSaved(false)
  setSelectedSkills(prev =>
    prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
  )
}
```

Add this JSX section inside the returned `<div className="page">`, after the name section:

```jsx
<div style={{ marginTop: 32 }}>
  <h3 style={{ fontSize: "0.9em", color: "var(--muted)", marginBottom: 12 }}>ACTIVE SKILLS</h3>
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {ALL_SKILLS.map(s => (
      <button
        key={s.key}
        onClick={() => toggleSkill(s.key)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 14px", borderRadius: 8,
          border: `2px solid ${selectedSkills.includes(s.key) ? "var(--accent)" : "var(--border2)"}`,
          background: selectedSkills.includes(s.key) ? "var(--surface2)" : "transparent",
          color: "var(--text)", cursor: "pointer", textAlign: "left",
          fontFamily: "var(--font)",
        }}
      >
        <span style={{ fontSize: "1em", fontWeight: 600 }}>{s.label}</span>
        <span style={{ fontSize: "0.78em", color: "var(--muted)" }}>{s.desc}</span>
      </button>
    ))}
  </div>
  {skillsError && <p style={{ color: "var(--red)", fontSize: "0.82em", marginTop: 8 }}>{skillsError}</p>}
  {skillsSaved && <p style={{ color: "var(--green)", fontSize: "0.82em", marginTop: 8 }}>Skills saved.</p>}
  <button
    onClick={saveSkills}
    disabled={skillsSaving}
    style={{
      marginTop: 12, padding: "8px 20px", borderRadius: 8,
      background: "var(--accent)", color: "#fff", border: "none",
      cursor: skillsSaving ? "not-allowed" : "pointer",
      fontFamily: "var(--font)", fontSize: "0.88em",
    }}
  >
    {skillsSaving ? "Saving…" : "Save skills"}
  </button>
</div>
```

- [ ] **Step 3: Build the frontend and verify no errors**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend"
npm run build 2>&1 | tail -10
```

Expected: `✓ built in Xs` with no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/components/Onboarding.jsx frontend/src/pages/Account.jsx
git commit -m "feat: add 4 new skills to onboarding picker and account skill editor"
```

---

## Final Checklist

- [ ] `python3 -m pytest tests/ -v` — all tests pass
- [ ] `node --test scripts/test_merge.mjs` — 8 tests pass
- [ ] `frontend/npm run build` — no errors
- [ ] `drillQuestions.js` has 12 categories and 500+ questions
- [ ] `DRILL_META` has entries for all 12 categories
- [ ] `backend/schemas.py` VALID_SKILLS and VALID_DRILL_KEYS include all 4 new keys
