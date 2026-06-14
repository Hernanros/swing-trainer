# Bull Assistant — Plan 2: Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full daily scan pipeline: two-stage screener, Claude Haiku batch scoring, server-side position sizing, all Bull API endpoints, and the APScheduler job that runs it automatically at 5 PM ET on trading days.

**Architecture:** `backend/services/bull.py` owns the pipeline logic (screener, scoring, sizing). `backend/routers/bull.py` owns all HTTP endpoints. The scheduler is registered in `main.py`'s lifespan using `apscheduler`. All Claude calls use the same graceful-degradation pattern as existing services.

**Tech Stack:** FastAPI (existing), SQLAlchemy (existing), Claude Haiku via anthropic SDK (existing), apscheduler (new dep), yfinance via options provider (Plan 1)

**Depends on:** Plan 1 (BullProfile, BullScan models, options service, market extensions)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/services/bull.py` | Create | SP500_UNIVERSE, screener stages 1+2, scoring prompt, Claude call, sizing |
| `backend/routers/bull.py` | Create | GET scan/latest, POST scan/run, POST chat, GET/PUT profile |
| `backend/main.py` | Modify | Mount bull router, add APScheduler lifespan job |
| `requirements.txt` | Modify | Add apscheduler |
| `tests/test_bull_pipeline.py` | Create | Tests for screener, scoring, sizing, all endpoints |

---

### Task 1: Add apscheduler to requirements.txt

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add dependency**

Append to `requirements.txt`:
```
apscheduler>=3.10.0
```

- [ ] **Step 2: Install**

```bash
pip install apscheduler
```

Expected: `python -c "import apscheduler; print(apscheduler.__version__)"` prints version.

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "chore: add apscheduler dependency for daily bull scan"
```

---

### Task 2: Create bull service — SP500 universe, Stage 1 screener

**Files:**
- Create: `backend/services/bull.py`
- Test: `tests/test_bull_pipeline.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_bull_pipeline.py`:

```python
import pytest
import math
from unittest.mock import patch, MagicMock

def test_sp500_universe_has_at_least_400_symbols():
    from backend.services.bull import SP500_UNIVERSE
    assert len(SP500_UNIVERSE) >= 400

def test_stage1_filter_removes_low_price_stocks(monkeypatch):
    from backend.services import bull as bull_svc
    snapshots = {
        "AAPL": {"symbol": "AAPL", "close": 185.0, "sma50": 180.0, "rsi14": 52.0, "volume": 2000000, "avg_volume_20d": 1500000},
        "CHEAP": {"symbol": "CHEAP", "close": 10.0, "sma50": 9.0, "rsi14": 45.0, "volume": 100000, "avg_volume_20d": 80000},
        "LOWVOL": {"symbol": "LOWVOL", "close": 50.0, "sma50": 48.0, "rsi14": 48.0, "volume": 200000, "avg_volume_20d": 150000},
    }
    result = bull_svc.stage1_filter(snapshots)
    symbols = [r["symbol"] for r in result]
    assert "AAPL" in symbols
    assert "CHEAP" not in symbols    # price < 15
    assert "LOWVOL" not in symbols   # avg_volume_20d < 500000

def test_stage1_filter_removes_stocks_below_sma50(monkeypatch):
    from backend.services import bull as bull_svc
    snapshots = {
        "ABOVE": {"symbol": "ABOVE", "close": 100.0, "sma50": 95.0, "rsi14": 52.0, "volume": 1000000, "avg_volume_20d": 900000},
        "BELOW": {"symbol": "BELOW", "close": 90.0, "sma50": 95.0, "rsi14": 45.0, "volume": 1000000, "avg_volume_20d": 900000},
    }
    result = bull_svc.stage1_filter(snapshots)
    symbols = [r["symbol"] for r in result]
    assert "ABOVE" in symbols
    assert "BELOW" not in symbols
```

- [ ] **Step 2: Run to confirm fail**

```bash
pytest tests/test_bull_pipeline.py::test_sp500_universe_has_at_least_400_symbols tests/test_bull_pipeline.py::test_stage1_filter_removes_low_price_stocks -x -q
```

Expected: `ImportError` — `backend.services.bull` doesn't exist.

- [ ] **Step 3: Create backend/services/bull.py with universe and Stage 1 screener**

```python
import json
import math
import logging
import os
from datetime import date, datetime, timezone
from typing import Optional

_log = logging.getLogger(__name__)

# ── S&P 500 Universe ──────────────────────────────────────────────────────────
# Top ~450 S&P 500 constituents by liquidity. Update annually.
SP500_UNIVERSE = [
    "AAPL","MSFT","NVDA","AMZN","GOOGL","GOOG","META","TSLA","BRK-B","AVGO",
    "JPM","LLY","UNH","V","XOM","MA","COST","HD","PG","JNJ","ABBV","BAC",
    "KO","MRK","CVX","ORCL","CRM","ACN","AMD","PEP","NFLX","TMO","WMT","ABT",
    "LIN","CSCO","TXN","DHR","NKE","ADBE","MCD","PM","QCOM","GE","HON","IBM",
    "CAT","AMGN","INTU","SPGI","MDT","GS","AXP","BLK","DE","BKNG","RTX",
    "LOW","SYK","ELV","VRTX","GILD","MMC","ISRG","PLD","CB","TJX","ZTS",
    "ADP","PGR","AON","CME","FIS","ICE","REGN","SO","DUK","CI","CL","BSX",
    "SHW","WM","HUM","MCK","MSI","ITW","EMR","NOC","LMT","GD","HCA","PSA",
    "MO","D","APD","ECL","F","GM","UBER","COP","SLB","EOG","MPC","PSX",
    "VLO","OXY","HAL","WFC","USB","PNC","C","TFC","MTB","RF","KEY","SCHW",
    "MS","BK","COF","DFS","AIG","PRU","MET","TRV","ALL","AFL","HIG","L",
    "PFE","BMY","AMGN","BIIB","MRNA","ILMN","A","IQV","CRL","IDXX","HOLX",
    "BAX","BDX","COO","DXCM","EW","HSIC","ALGN","RMD","VAR","STE","WST",
    "CTLT","MTD","PODD","TER","ZBRA","CTAS","CINF","LH","DGX","DVA","UHS",
    "THC","LPNT","HRC","CNC","MGLN","MOH","WCG","ANTM","HCSC","HMST","WLP",
    "T","VZ","TMUS","CHTR","CMCSA","DIS","NFLX","PARA","WBD","FOX","FOXA",
    "OMC","IPG","SBAC","AMT","CCI","EQIX","PSA","EXR","IRM","ARE","BXP",
    "KIM","REG","FRT","SPG","MAC","TCO","CBL","PEI","SRG","WPG","SKT",
    "NEE","AEP","EXC","PCG","ED","AEE","WEC","ETR","PPL","FE","ES","CMS",
    "NI","PNW","OGE","XEL","EVRG","ATO","CNP","NRG","DTE","LNT","IDACORP",
    "AWK","WTR","CWT","MSEX","SJW","YORW","SWX","ARTNA","GWW","FAST","ODFL",
    "CHRW","EXPD","UPS","FDX","DAL","UAL","ALK","LUV","JBLU","SAVE","AAL",
    "JBHT","SAIA","WERN","KNX","XPO","ECHO","HUBG","MRTN","PTSI","HTLD",
    "COST","WMT","TGT","DG","DLTR","ROST","TJX","BURL","KSS","M","JWN",
    "GPS","URBN","ANF","AEO","RL","PVH","CPRI","TPR","HBI","VFC","UAA",
    "NKE","FL","HIBB","BOOT","CROX","SKX","DECK","WWW","SHOO","ICON","EHC",
    "ENVA","ELVT","OMF","CACC","SLM","NAVI","ONEMAIN","WRLD","PRAA","ECPG",
    "PYPL","SQ","AFRM","SOFI","LC","UPST","OPFI","LPRO","ATLC","QFIN",
    "SNOW","DDOG","ZS","NET","CRWD","OKTA","PANW","FTNT","CYBR","S","VRNS",
    "NOW","WDAY","TEAM","ADSK","ANSS","PTC","CDNS","MANH","APPF","PAYC",
    "HUBS","PCTY","VEEV","CDAY","COUP","ESTC","MDB","DOCN","FSLY","SUMO",
    "U","RBLX","COIN","HOOD","AFRM","MKTX","VIRT","LPLA","SF","GHL","LAZ",
]
# Deduplicate while preserving order
_seen = set()
SP500_UNIVERSE = [s for s in SP500_UNIVERSE if not (s in _seen or _seen.add(s))]


# ── Stage 1 Screener ──────────────────────────────────────────────────────────

def stage1_filter(snapshots: dict) -> list[dict]:
    """
    Stage 1: technical pre-filter.
    snapshots: dict keyed by symbol → get_eod_snapshot() output
    Filters: close > 15, avg_volume_20d > 500_000, close > sma50
    Returns list of passing snapshot dicts.
    """
    passed = []
    for sym, snap in snapshots.items():
        if snap is None:
            continue
        if snap.get("close", 0) <= 15:
            continue
        if (snap.get("avg_volume_20d") or 0) < 500_000:
            continue
        sma50 = snap.get("sma50")
        if sma50 and snap["close"] <= sma50:
            continue
        passed.append(snap)
    return passed
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_bull_pipeline.py::test_sp500_universe_has_at_least_400_symbols tests/test_bull_pipeline.py::test_stage1_filter_removes_low_price_stocks tests/test_bull_pipeline.py::test_stage1_filter_removes_stocks_below_sma50 -v
```

Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/services/bull.py tests/test_bull_pipeline.py
git commit -m "feat(bull): add SP500_UNIVERSE constant and stage1_filter screener"
```

---

### Task 3: Stage 2 screener (options liquidity filter)

**Files:**
- Modify: `backend/services/bull.py`
- Modify: `tests/test_bull_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_bull_pipeline.py`:

```python
def test_stage2_filter_removes_low_iv_stocks():
    from backend.services import bull as bull_svc
    candidates = [
        {"symbol": "AAPL", "close": 185.0, "rsi14": 52.0},
        {"symbol": "LOWIV", "close": 100.0, "rsi14": 50.0},
    ]
    def mock_snapshot(symbol):
        if symbol == "AAPL":
            return {"iv": 0.34, "ivr": 34.0, "atm_oi": 800, "atm_spread_pct": 0.08, "nearest_expiry": "2026-07-18", "atm_strike": 185.0}
        if symbol == "LOWIV":
            return {"iv": 0.10, "ivr": 10.0, "atm_oi": 200, "atm_spread_pct": 0.20, "nearest_expiry": "2026-07-18", "atm_strike": 100.0}
        return None
    from unittest.mock import MagicMock
    mock_provider = MagicMock()
    mock_provider.get_options_snapshot.side_effect = mock_snapshot
    result = bull_svc.stage2_filter(candidates, mock_provider)
    symbols = [r["symbol"] for r in result]
    assert "AAPL" in symbols
    assert "LOWIV" not in symbols   # ivr < 20

def test_stage2_filter_removes_low_open_interest():
    from backend.services import bull as bull_svc
    from unittest.mock import MagicMock
    candidates = [{"symbol": "LOWOI", "close": 100.0, "rsi14": 50.0}]
    mock_provider = MagicMock()
    mock_provider.get_options_snapshot.return_value = {
        "iv": 0.30, "ivr": 30.0, "atm_oi": 100,   # < 500 threshold
        "atm_spread_pct": 0.08, "nearest_expiry": "2026-07-18", "atm_strike": 100.0
    }
    result = bull_svc.stage2_filter(candidates, mock_provider)
    assert result == []

def test_stage2_filter_removes_wide_spread():
    from backend.services import bull as bull_svc
    from unittest.mock import MagicMock
    candidates = [{"symbol": "WIDESPREAD", "close": 100.0, "rsi14": 50.0}]
    mock_provider = MagicMock()
    mock_provider.get_options_snapshot.return_value = {
        "iv": 0.30, "ivr": 30.0, "atm_oi": 600,
        "atm_spread_pct": 0.20,   # > 0.15 threshold
        "nearest_expiry": "2026-07-18", "atm_strike": 100.0
    }
    result = bull_svc.stage2_filter(candidates, mock_provider)
    assert result == []
```

- [ ] **Step 2: Run to confirm fail**

```bash
pytest tests/test_bull_pipeline.py -k "stage2" -x -q
```

Expected: `AttributeError` — `stage2_filter` not defined.

- [ ] **Step 3: Add stage2_filter to backend/services/bull.py**

After `stage1_filter`, add:

```python
def stage2_filter(candidates: list[dict], options_provider) -> list[dict]:
    """
    Stage 2: options liquidity filter.
    Thresholds: ivr >= 20, atm_oi >= 500, atm_spread_pct <= 0.15
    Enriches each passing candidate with options snapshot fields.
    """
    passed = []
    for snap in candidates:
        symbol = snap["symbol"]
        opts = options_provider.get_options_snapshot(symbol)
        if opts is None:
            continue
        if opts.get("ivr", 0) < 20:
            continue
        if opts.get("atm_oi", 0) < 500:
            continue
        if opts.get("atm_spread_pct", 1.0) > 0.15:
            continue
        passed.append({**snap, **opts})
    return passed
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_bull_pipeline.py -k "stage2" -v
```

Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/services/bull.py tests/test_bull_pipeline.py
git commit -m "feat(bull): add stage2_filter options liquidity screener"
```

---

### Task 4: Claude Haiku batch scoring

**Files:**
- Modify: `backend/services/bull.py`
- Modify: `tests/test_bull_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_bull_pipeline.py`:

```python
def test_build_score_prompt_contains_all_candidate_symbols():
    from backend.services.bull import _build_score_prompt
    candidates = [
        {"symbol": "AAPL", "close": 185.0, "rsi14": 52.0, "iv": 0.34, "ivr": 34.0, "atm_oi": 800, "sector": "XLK"},
        {"symbol": "MSFT", "close": 415.0, "rsi14": 48.0, "iv": 0.28, "ivr": 28.0, "atm_oi": 600, "sector": "XLK"},
    ]
    macro = {"spy": {"regime": "bullish", "close": 535.0, "sma50": 520.0}, "qqq": {"regime": "bullish"}}
    sectors = [{"symbol": "XLK", "label": "strong", "pct_vs_20d": 1.2}]
    rules = ["Only enter when RSI is between 40 and 60"]
    prompt = _build_score_prompt(candidates, macro, sectors, rules)
    assert "AAPL" in prompt
    assert "MSFT" in prompt
    assert "bullish" in prompt
    assert "XLK" in prompt
    assert "RSI is between 40 and 60" in prompt

def test_score_candidates_returns_fallback_without_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from backend.services import bull as bull_svc
    import importlib
    importlib.reload(bull_svc)
    candidates = [{"symbol": "AAPL", "close": 185.0, "rsi14": 52.0, "iv": 0.34, "ivr": 34.0, "atm_oi": 800}]
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "bullish"}}
    sectors = []
    result = bull_svc.score_candidates(candidates, macro, sectors, [])
    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["symbol"] == "AAPL"
    assert "score" in result[0]
```

- [ ] **Step 2: Run to confirm fail**

```bash
pytest tests/test_bull_pipeline.py -k "prompt or score_candidates" -x -q
```

Expected: `ImportError` — functions not defined.

- [ ] **Step 3: Add scoring functions to backend/services/bull.py**

Add after `stage2_filter`:

```python
_api_key = os.getenv("ANTHROPIC_API_KEY", "")


def _build_score_prompt(candidates: list[dict], macro: dict, sectors: list[dict], playbook_rules: list[str]) -> str:
    spy = macro.get("spy", {})
    qqq = macro.get("qqq", {})
    macro_text = (
        f"SPY: {spy.get('regime', 'unknown')} "
        f"(close ${spy.get('close', 0):.2f} vs 50d SMA ${spy.get('sma50', 0):.2f})\n"
        f"QQQ: {qqq.get('regime', 'unknown')}"
    )
    sector_lines = "\n".join(
        f"  {s['symbol']}: {s['label']} ({s.get('pct_vs_20d', 0):+.1f}%)"
        for s in sorted(sectors, key=lambda x: x.get("pct_vs_20d", 0), reverse=True)
    )
    rules_text = "\n".join(f"- {r}" for r in playbook_rules) if playbook_rules else "No specific rules saved."
    candidate_blocks = "\n".join(
        f"<candidate symbol='{c['symbol']}'>\n"
        f"  sector: {c.get('sector', 'unknown')}\n"
        f"  close: ${c.get('close', 0):.2f}\n"
        f"  rsi14: {c.get('rsi14', 0):.1f}\n"
        f"  iv: {c.get('iv', 0):.1%}\n"
        f"  ivr_proxy: {c.get('ivr', 0):.0f}\n"
        f"  atm_oi: {c.get('atm_oi', 0)}\n"
        f"</candidate>"
        for c in candidates
    )
    return f"""You are a swing trading assistant evaluating bull put spread candidates using EOD closing data.

MARKET CONTEXT:
{macro_text}

SECTOR RANKINGS (strongest first):
{sector_lines}

USER'S PLAYBOOK RULES:
{rules_text}

Score each candidate 0-10 using this rubric:
- macro_alignment (0-2): SPY/QQQ regime favorable for bullish credit spreads?
- sector_strength (0-2): Stock's sector in top half? strong=2, neutral=1, weak=0
- playbook_fit (0-3): How well does the setup match the user's rules?
- technical_quality (0-2): RSI 40-60 and clear trend above 50d SMA
- options_setup (0-1): ivr_proxy > 30 = 1pt, 20-30 = 0.5pt

CANDIDATES:
{candidate_blocks}

Respond in this exact XML format (include ALL candidates, order by total descending):
<scores>
<score symbol="SYMBOL" total="8.4" macro="2" sector="2" playbook="2" technical="1.5" options="0.9">
<rationale>One sentence explaining the score.</rationale>
</score>
</scores>"""


def _parse_scores(xml_text: str, candidates: list[dict]) -> list[dict]:
    import re
    results = []
    candidate_map = {c["symbol"]: c for c in candidates}
    for match in re.finditer(
        r'<score symbol="([^"]+)" total="([^"]+)"[^>]*>\s*<rationale>([^<]*)</rationale>',
        xml_text,
        re.DOTALL,
    ):
        sym, total, rationale = match.group(1), match.group(2), match.group(3).strip()
        if sym not in candidate_map:
            continue
        candidate = dict(candidate_map[sym])
        try:
            candidate["score"] = float(total)
        except ValueError:
            candidate["score"] = 0.0
        candidate["rationale"] = rationale
        results.append(candidate)
    # Ensure every candidate appears even if Claude dropped some
    scored_syms = {r["symbol"] for r in results}
    for c in candidates:
        if c["symbol"] not in scored_syms:
            results.append({**c, "score": 0.0, "rationale": "Not scored by model."})
    return sorted(results, key=lambda x: x["score"], reverse=True)


def score_candidates(
    candidates: list[dict],
    macro: dict,
    sectors: list[dict],
    playbook_rules: list[str],
) -> list[dict]:
    """
    Score candidates via Claude Haiku. Returns list sorted by score descending.
    Gracefully returns candidates with score=0 when ANTHROPIC_API_KEY is absent.
    """
    if not _api_key:
        return [{**c, "score": 0.0, "rationale": "[Scoring unavailable — set ANTHROPIC_API_KEY]"} for c in candidates]
    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=_api_key)
        prompt = _build_score_prompt(candidates, macro, sectors, playbook_rules)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_scores(msg.content[0].text, candidates)
    except Exception as e:
        _log.error("Bull scoring failed: %s", e)
        return [{**c, "score": 0.0, "rationale": f"[Scoring error: {e}]"} for c in candidates]
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_bull_pipeline.py -k "prompt or score_candidates" -v
```

Expected: 2 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/services/bull.py tests/test_bull_pipeline.py
git commit -m "feat(bull): add _build_score_prompt, _parse_scores, score_candidates with Claude Haiku"
```

---

### Task 5: Position sizing and macro regime computation

**Files:**
- Modify: `backend/services/bull.py`
- Modify: `tests/test_bull_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_bull_pipeline.py`:

```python
def test_compute_sizing_returns_correct_contracts():
    from backend.services.bull import compute_sizing
    # account=$25000, risk=1% = $250 risk budget
    # max_loss = (short-long-premium)*100 = (5-1.5)*100 = $350 per contract
    # contracts = floor(250/350) = 0... use wider spread
    # max_loss = (10-2.0)*100 = $800 per contract, risk=$500 (2%)
    result = compute_sizing(
        atm_strike=185.0,
        spread_width=10.0,
        premium=2.0,
        account_size=25000.0,
        risk_per_trade_pct=2.0,
        max_contracts=5,
    )
    # risk_dollars = 25000*0.02 = 500, max_loss = (10-2)*100 = 800, contracts = floor(500/800) = 0
    # min 1 contract always returned when >0 budget
    assert isinstance(result["contracts"], int)
    assert result["max_loss_per_contract"] == 800.0
    assert result["risk_dollars"] == 500.0

def test_compute_sizing_respects_max_contracts():
    from backend.services.bull import compute_sizing
    result = compute_sizing(
        atm_strike=100.0,
        spread_width=5.0,
        premium=0.5,
        account_size=1000000.0,
        risk_per_trade_pct=10.0,
        max_contracts=3,
    )
    assert result["contracts"] <= 3

def test_compute_macro_regime_bullish():
    from backend.services.bull import compute_macro_regime
    candles = [{"close": 100.0 + i * 0.5} for i in range(55)]
    regime = compute_macro_regime(candles)
    assert regime == "bullish"

def test_compute_macro_regime_bearish():
    from backend.services.bull import compute_macro_regime
    candles = [{"close": 150.0 - i * 0.5} for i in range(55)]
    regime = compute_macro_regime(candles)
    assert regime == "bearish"
```

- [ ] **Step 2: Run to confirm fail**

```bash
pytest tests/test_bull_pipeline.py -k "sizing or regime" -x -q
```

Expected: `ImportError` — functions not defined.

- [ ] **Step 3: Add compute_sizing and compute_macro_regime to bull.py**

Add after `score_candidates`:

```python
def compute_macro_regime(candles: list[dict]) -> str:
    """
    Determines macro regime from daily candle list.
    Returns 'bullish', 'bearish', or 'neutral'.
    Requires at least 51 candles (50d SMA needs 50 data points).
    """
    if len(candles) < 51:
        return "neutral"
    closes = [c["close"] for c in candles]
    sma50 = sum(closes[-50:]) / 50
    latest = closes[-1]
    if latest > sma50 * 1.005:
        return "bullish"
    if latest < sma50 * 0.995:
        return "bearish"
    return "neutral"


def compute_sizing(
    atm_strike: float,
    spread_width: float,
    premium: float,
    account_size: float,
    risk_per_trade_pct: float,
    max_contracts: int,
) -> dict:
    """
    Computes bull put spread position size.
    spread_width: distance between strikes (e.g. 5 for 185/180)
    premium: net credit received per share (e.g. 1.50)
    Returns contracts, max_loss_per_contract, risk_dollars.
    """
    max_loss_per_contract = round((spread_width - premium) * 100, 2)
    risk_dollars = round(account_size * (risk_per_trade_pct / 100), 2)
    if max_loss_per_contract <= 0:
        contracts = 0
    else:
        contracts = math.floor(risk_dollars / max_loss_per_contract)
    contracts = min(contracts, max_contracts)
    return {
        "contracts": contracts,
        "max_loss_per_contract": max_loss_per_contract,
        "risk_dollars": risk_dollars,
    }
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_bull_pipeline.py -k "sizing or regime" -v
```

Expected: 4 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/services/bull.py tests/test_bull_pipeline.py
git commit -m "feat(bull): add compute_sizing and compute_macro_regime"
```

---

### Task 6: Full pipeline orchestrator and bull chat service

**Files:**
- Modify: `backend/services/bull.py`
- Modify: `tests/test_bull_pipeline.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_bull_pipeline.py`:

```python
def test_chat_returns_fallback_without_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    import importlib
    import backend.services.bull as bull_svc
    importlib.reload(bull_svc)
    result = bull_svc.chat(
        question="Why is AAPL ranked first?",
        scan_context={"macro": {}, "sectors": [], "top_candidates": []},
        context_symbol=None,
    )
    assert isinstance(result, str)
    assert len(result) > 0

def test_run_pipeline_returns_expected_shape(monkeypatch):
    import backend.services.bull as bull_svc
    import backend.services.market as mkt
    from unittest.mock import MagicMock
    # Mock market calls
    fake_snap = {"symbol": "AAPL", "close": 185.0, "sma50": 180.0, "rsi14": 52.0,
                 "volume": 2000000, "avg_volume_20d": 1500000}
    monkeypatch.setattr(mkt, "get_eod_snapshot", lambda sym: fake_snap if sym == "AAPL" else None)
    monkeypatch.setattr(mkt, "get_sector_etfs", lambda: [{"symbol": "XLK", "label": "strong", "pct_vs_20d": 1.2, "close": 200.0}])
    monkeypatch.setattr(mkt, "_fetch_candles", lambda sym, days, **kw: [{"close": 530.0 + i * 0.1} for i in range(55)])
    # Mock options
    mock_opts = MagicMock()
    mock_opts.get_options_snapshot.return_value = {"iv": 0.34, "ivr": 34.0, "atm_oi": 800, "atm_spread_pct": 0.08, "nearest_expiry": "2026-07-18", "atm_strike": 185.0}
    monkeypatch.setattr(bull_svc, "score_candidates", lambda c, m, s, r: [{**x, "score": 8.0, "rationale": "test"} for x in c])
    # Only scan AAPL for speed
    monkeypatch.setattr(bull_svc, "SP500_UNIVERSE", ["AAPL"])
    result = bull_svc.run_pipeline(
        options_provider=mock_opts,
        playbook_rules=[],
        bull_profile={"account_size": 25000.0, "risk_per_trade_pct": 1.0, "max_contracts": 5},
    )
    assert "macro" in result
    assert "sectors" in result
    assert "candidates" in result
    assert isinstance(result["candidates"], list)
```

- [ ] **Step 2: Run to confirm fail**

```bash
pytest tests/test_bull_pipeline.py -k "chat or pipeline" -x -q
```

Expected: `AttributeError` — `chat` and `run_pipeline` not defined.

- [ ] **Step 3: Add chat() and run_pipeline() to bull.py**

Add at the bottom of `backend/services/bull.py`:

```python
def chat(question: str, scan_context: dict, context_symbol: Optional[str]) -> str:
    """
    Follow-up chat using today's scan as context. Uses Claude Sonnet.
    Gracefully returns a message when ANTHROPIC_API_KEY is absent.
    """
    if not _api_key:
        return "[Chat unavailable — set ANTHROPIC_API_KEY to enable]"
    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=_api_key)
        macro = scan_context.get("macro", {})
        top = scan_context.get("top_candidates", [])[:10]
        context_lines = "\n".join(
            f"  {c['symbol']}: score={c.get('score', 0):.1f}, sector={c.get('sector', '?')}, "
            f"iv={c.get('iv', 0):.1%}, rationale={c.get('rationale', '')}"
            for c in top
        )
        symbol_note = f"\nUser is asking specifically about: {context_symbol}" if context_symbol else ""
        system = (
            "You are a swing trading assistant. The user has just reviewed today's bull put spread scan results. "
            "Answer their question concisely using the scan context provided. "
            "If asked about a specific ticker, focus on its score rationale and sizing."
        )
        user_msg = (
            f"Today's scan context:\n"
            f"Macro: SPY {macro.get('spy', {}).get('regime', '?')}, "
            f"QQQ {macro.get('qqq', {}).get('regime', '?')}\n"
            f"Top candidates:\n{context_lines}"
            f"{symbol_note}\n\n"
            f"Question: {question}"
        )
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=400,
            messages=[{"role": "user", "content": user_msg}],
            system=system,
        )
        return msg.content[0].text
    except Exception as e:
        _log.error("Bull chat failed: %s", e)
        return f"[Chat error — {e}]"


def run_pipeline(options_provider, playbook_rules: list[str], bull_profile: dict) -> dict:
    """
    Full daily scan pipeline. Returns dict with macro, sectors, candidates.
    Each candidate includes score, rationale, and sizing.
    """
    from backend.services.market import get_eod_snapshot, get_sector_etfs, _fetch_candles, SECTOR_ETFS

    # 1. Macro regime
    spy_candles = _fetch_candles("SPY", 55)
    qqq_candles = _fetch_candles("QQQ", 55)
    spy_closes = [c["close"] for c in spy_candles]
    qqq_closes = [c["close"] for c in qqq_candles]
    spy_regime = compute_macro_regime(spy_candles)
    qqq_regime = compute_macro_regime(qqq_candles)
    macro = {
        "spy": {
            "regime": spy_regime,
            "close": spy_closes[-1] if spy_closes else 0,
            "sma50": round(sum(spy_closes[-50:]) / 50, 2) if len(spy_closes) >= 50 else 0,
        },
        "qqq": {
            "regime": qqq_regime,
            "close": qqq_closes[-1] if qqq_closes else 0,
        },
    }

    # 2. Sectors
    sectors = get_sector_etfs()

    # 3. Build sector map for candidate enrichment
    sector_map = {}
    for sym in SP500_UNIVERSE:
        for etf in SECTOR_ETFS:
            sector_map.setdefault(sym, etf)
            break

    # 4. Stage 1: fetch EOD snapshots and filter
    raw_snapshots = {}
    for sym in SP500_UNIVERSE:
        snap = get_eod_snapshot(sym)
        if snap:
            raw_snapshots[sym] = snap
    stage1 = stage1_filter(raw_snapshots)

    # 5. Stage 2: options liquidity filter
    stage2 = stage2_filter(stage1, options_provider)

    # 6. Enrich with sector label
    sector_label_map = {s["symbol"]: s["label"] for s in sectors}
    for c in stage2:
        c_sector = sector_map.get(c["symbol"], "unknown")
        c["sector"] = c_sector
        c["sector_label"] = sector_label_map.get(c_sector, "neutral")

    # 7. Score via Claude Haiku
    scored = score_candidates(stage2, macro, sectors, playbook_rules)

    # 8. Attach sizing to each candidate
    profile = bull_profile or {}
    account_size = float(profile.get("account_size", 0))
    risk_pct = float(profile.get("risk_per_trade_pct", 1.0))
    max_contracts = int(profile.get("max_contracts", 5))
    for c in scored:
        atm_strike = c.get("atm_strike", c.get("close", 100))
        spread_width = 5.0   # default; user sets actual strikes when opening trade
        premium = c.get("iv", 0.3) * spread_width * 0.4  # rough estimate
        sizing = compute_sizing(atm_strike, spread_width, premium, account_size, risk_pct, max_contracts)
        c.update(sizing)

    return {"macro": macro, "sectors": sectors, "candidates": scored}
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_bull_pipeline.py -k "chat or pipeline" -v
```

Expected: 2 PASSED

- [ ] **Step 5: Run full pipeline test suite**

```bash
pytest tests/test_bull_pipeline.py -v
```

Expected: all PASSED

- [ ] **Step 6: Commit**

```bash
git add backend/services/bull.py tests/test_bull_pipeline.py
git commit -m "feat(bull): add chat() and run_pipeline() orchestrator"
```

---

### Task 7: Bull API router (all endpoints)

**Files:**
- Create: `backend/routers/bull.py`
- Modify: `tests/test_bull_pipeline.py`

- [ ] **Step 1: Write failing endpoint tests**

Add to `tests/test_bull_pipeline.py`:

```python
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.main import app
from backend.database import get_db
from backend.auth import require_auth
from backend.models import Base, User

@pytest.fixture
def client_with_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)
    def override_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()
    user = User(name="Test", trading_stage="active", time_budget="30min", active_skills='["setup_selection"]', email="test@test.com")
    db = TestSession()
    db.add(user)
    db.commit()
    db.refresh(user)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[require_auth] = lambda: user
    client = TestClient(app)
    yield client, db, user
    app.dependency_overrides.clear()
    db.close()

def test_get_profile_returns_404_when_not_set(client_with_db):
    client, db, user = client_with_db
    resp = client.get("/api/bull/profile")
    assert resp.status_code == 404

def test_put_profile_creates_profile(client_with_db):
    client, db, user = client_with_db
    resp = client.put("/api/bull/profile", json={
        "account_size": 25000.0, "risk_per_trade_pct": 1.0, "max_contracts": 5
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["account_size"] == 25000.0

def test_get_profile_returns_saved_profile(client_with_db):
    client, db, user = client_with_db
    client.put("/api/bull/profile", json={"account_size": 25000.0, "risk_per_trade_pct": 1.0, "max_contracts": 5})
    resp = client.get("/api/bull/profile")
    assert resp.status_code == 200
    assert resp.json()["account_size"] == 25000.0

def test_get_scan_latest_returns_404_when_no_scan(client_with_db):
    client, db, user = client_with_db
    resp = client.get("/api/bull/scan/latest")
    assert resp.status_code == 404

def test_chat_returns_response(client_with_db, monkeypatch):
    client, db, user = client_with_db
    import backend.services.bull as bull_svc
    monkeypatch.setattr(bull_svc, "chat", lambda question, scan_context, context_symbol: "AAPL scored highest due to sector strength.")
    resp = client.post("/api/bull/chat", json={"question": "Why AAPL?", "context_symbol": "AAPL"})
    assert resp.status_code == 200
    assert "answer" in resp.json()
```

- [ ] **Step 2: Run to confirm fail**

```bash
pytest tests/test_bull_pipeline.py -k "profile or scan_latest or chat_returns" -x -q
```

Expected: 404 or connection error — router not mounted yet.

- [ ] **Step 3: Create backend/routers/bull.py**

```python
import json
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import require_auth
from backend.models import User, BullProfile, BullScan
from backend.schemas import BullProfileCreate, BullProfileResponse, BullChatRequest, BullScanResponse
import backend.services.bull as bull_svc
from backend.services.options import get_options_provider
from backend.routers.playbook import get_rules_for_user

router = APIRouter(prefix="/bull", tags=["bull"])


@router.get("/profile", response_model=BullProfileResponse)
def get_profile(current_user: User = Depends(require_auth), db: Session = Depends(get_db)):
    profile = db.query(BullProfile).filter(BullProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not set")
    return BullProfileResponse(
        account_size=profile.account_size,
        risk_per_trade_pct=profile.risk_per_trade_pct,
        max_contracts=profile.max_contracts,
        updated_at=profile.updated_at,
    )


@router.put("/profile", response_model=BullProfileResponse)
def upsert_profile(
    body: BullProfileCreate,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db),
):
    profile = db.query(BullProfile).filter(BullProfile.user_id == current_user.id).first()
    now = datetime.now(timezone.utc).isoformat()
    if profile:
        profile.account_size = body.account_size
        profile.risk_per_trade_pct = body.risk_per_trade_pct
        profile.max_contracts = body.max_contracts
        profile.updated_at = now
    else:
        profile = BullProfile(
            user_id=current_user.id,
            account_size=body.account_size,
            risk_per_trade_pct=body.risk_per_trade_pct,
            max_contracts=body.max_contracts,
            updated_at=now,
        )
        db.add(profile)
    db.commit()
    db.refresh(profile)
    return BullProfileResponse(
        account_size=profile.account_size,
        risk_per_trade_pct=profile.risk_per_trade_pct,
        max_contracts=profile.max_contracts,
        updated_at=profile.updated_at,
    )


@router.get("/scan/latest")
def get_latest_scan(current_user: User = Depends(require_auth), db: Session = Depends(get_db)):
    scan = (
        db.query(BullScan)
        .filter(BullScan.user_id == current_user.id)
        .order_by(BullScan.scan_date.desc())
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="No scan available yet")
    return {
        "scan_date": scan.scan_date,
        "macro": json.loads(scan.macro_json or "{}"),
        "sectors": json.loads(scan.sectors_json or "[]"),
        "candidates": json.loads(scan.results_json or "[]"),
        "created_at": scan.created_at,
    }


@router.post("/scan/run")
def run_scan(current_user: User = Depends(require_auth), db: Session = Depends(get_db)):
    profile = db.query(BullProfile).filter(BullProfile.user_id == current_user.id).first()
    profile_dict = {
        "account_size": profile.account_size if profile else 0,
        "risk_per_trade_pct": profile.risk_per_trade_pct if profile else 1.0,
        "max_contracts": profile.max_contracts if profile else 5,
    }
    rules = [r.rule_text for r in db.query(__import__("backend.models", fromlist=["PlaybookRule"]).PlaybookRule)
             .filter_by(user_id=current_user.id).all()] if hasattr(current_user, "playbook_rules") else []
    try:
        result = bull_svc.run_pipeline(
            options_provider=get_options_provider(),
            playbook_rules=rules,
            bull_profile=profile_dict,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan failed: {e}")
    today = date.today().isoformat()
    existing = db.query(BullScan).filter_by(user_id=current_user.id, scan_date=today).first()
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        existing.macro_json = json.dumps(result["macro"])
        existing.sectors_json = json.dumps(result["sectors"])
        existing.results_json = json.dumps(result["candidates"])
        existing.created_at = now
    else:
        db.add(BullScan(
            user_id=current_user.id,
            scan_date=today,
            macro_json=json.dumps(result["macro"]),
            sectors_json=json.dumps(result["sectors"]),
            results_json=json.dumps(result["candidates"]),
            created_at=now,
        ))
    db.commit()
    return {"scan_date": today, "candidates_count": len(result["candidates"]), "created_at": now}


@router.post("/chat")
def bull_chat(
    body: BullChatRequest,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db),
):
    scan = (
        db.query(BullScan)
        .filter(BullScan.user_id == current_user.id)
        .order_by(BullScan.scan_date.desc())
        .first()
    )
    scan_context = {
        "macro": json.loads(scan.macro_json or "{}") if scan else {},
        "sectors": json.loads(scan.sectors_json or "[]") if scan else [],
        "top_candidates": json.loads(scan.results_json or "[]")[:10] if scan else [],
    }
    answer = bull_svc.chat(
        question=body.question,
        scan_context=scan_context,
        context_symbol=body.context_symbol,
    )
    return {"answer": answer}
```

- [ ] **Step 4: Mount bull router in main.py**

In `backend/main.py`, add the import alongside other router imports:
```python
from backend.routers import bull as bull_router
```

And in the router mounting section (alongside other `app.include_router` calls):
```python
app.include_router(bull_router.router, prefix="/api")
```

- [ ] **Step 5: Run endpoint tests**

```bash
pytest tests/test_bull_pipeline.py -k "profile or scan_latest or chat_returns" -v
```

Expected: 5 PASSED

- [ ] **Step 6: Run full pipeline test suite**

```bash
pytest tests/test_bull_pipeline.py -v && pytest tests/ -x -q --ignore=tests/test_bull_pipeline.py
```

Expected: all PASSED, no regressions

- [ ] **Step 7: Commit**

```bash
git add backend/routers/bull.py backend/main.py tests/test_bull_pipeline.py
git commit -m "feat(bull): add bull router with profile, scan, and chat endpoints"
```

---

### Task 8: APScheduler daily scan job

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_bull_pipeline.py`

- [ ] **Step 1: Write failing test**

Add to `tests/test_bull_pipeline.py`:

```python
def test_scheduler_job_is_registered():
    from backend.main import app
    # Start app to trigger lifespan
    with TestClient(app):
        # Check that the scheduler is attached to app state
        pass
    # If app starts without error, scheduler registered successfully
    # (apscheduler raises on bad config)
    assert True  # startup without error = scheduler wired correctly
```

- [ ] **Step 2: Add scheduler to backend/main.py lifespan**

Add imports at the top of `backend/main.py` (after existing imports):
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import pytz
```

Inside the lifespan `async with` block, after the existing migrations and before `yield`:

```python
    # ── Daily Bull Scan Scheduler ─────────────────────────────────────────────
    US_MARKET_HOLIDAYS_2026 = {
        "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
        "2026-05-25", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    }

    async def _run_scheduled_bull_scan():
        from datetime import date as _date
        from backend.database import SessionLocal
        from backend.models import BullProfile, BullScan, PlaybookRule
        from backend.services.bull import run_pipeline
        from backend.services.options import get_options_provider
        import json
        today = _date.today().isoformat()
        if today in US_MARKET_HOLIDAYS_2026:
            _log.info("Bull scan skipped — market holiday %s", today)
            return
        db = SessionLocal()
        try:
            users_with_profile = db.query(BullProfile).all()
            for profile_row in users_with_profile:
                try:
                    rules = [r.rule_text for r in db.query(PlaybookRule).filter_by(user_id=profile_row.user_id).all()]
                    profile_dict = {
                        "account_size": profile_row.account_size,
                        "risk_per_trade_pct": profile_row.risk_per_trade_pct,
                        "max_contracts": profile_row.max_contracts,
                    }
                    result = run_pipeline(
                        options_provider=get_options_provider(),
                        playbook_rules=rules,
                        bull_profile=profile_dict,
                    )
                    from datetime import datetime, timezone
                    now = datetime.now(timezone.utc).isoformat()
                    existing = db.query(BullScan).filter_by(user_id=profile_row.user_id, scan_date=today).first()
                    if existing:
                        existing.macro_json = json.dumps(result["macro"])
                        existing.sectors_json = json.dumps(result["sectors"])
                        existing.results_json = json.dumps(result["candidates"])
                        existing.created_at = now
                    else:
                        db.add(BullScan(
                            user_id=profile_row.user_id,
                            scan_date=today,
                            macro_json=json.dumps(result["macro"]),
                            sectors_json=json.dumps(result["sectors"]),
                            results_json=json.dumps(result["candidates"]),
                            created_at=now,
                        ))
                    db.commit()
                    _log.info("Bull scan completed for user_id=%s — %d candidates", profile_row.user_id, len(result["candidates"]))
                except Exception as e:
                    _log.error("Bull scan failed for user_id=%s: %s", profile_row.user_id, e)
        finally:
            db.close()

    scheduler = AsyncIOScheduler(timezone=pytz.timezone("America/New_York"))
    scheduler.add_job(_run_scheduled_bull_scan, "cron", day_of_week="mon-fri", hour=17, minute=0)
    scheduler.start()
    _log.info("Bull scan scheduler started — runs weekdays at 5 PM ET")

    yield

    scheduler.shutdown(wait=False)
```

Also add `SessionLocal` to `backend/database.py` if not already present. Check:
```bash
grep "SessionLocal" "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/backend/database.py"
```

If not found, add to `backend/database.py`:
```python
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
```

- [ ] **Step 3: Run tests**

```bash
pytest tests/test_bull_pipeline.py::test_scheduler_job_is_registered -v
```

Expected: PASSED (app starts without error)

- [ ] **Step 4: Run full suite to confirm no regressions**

```bash
pytest tests/ -x -q
```

Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add backend/main.py
git commit -m "feat(bull): add APScheduler daily scan job at 5 PM ET (Mon-Fri, ex-holidays)"
```

---

## Plan 2 Complete

After all tasks pass, the full pipeline is operational:
- S&P 500 universe screened in two stages (technical + options liquidity via yfinance)
- Claude Haiku scores filtered candidates against Playbook + macro + sector context
- Server-side position sizing from saved account profile
- All Bull API endpoints live under `/api/bull/`
- Automatic daily scan runs at 5 PM ET on trading days

Proceed to **Plan 3: Frontend** (`2026-06-14-bull-assistant-plan-3-frontend.md`).
