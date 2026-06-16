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
    "MS","BK","COF","AIG","PRU","MET","TRV","ALL","AFL","HIG","L",
    "PFE","BMY","BIIB","MRNA","ILMN","A","IQV","CRL","IDXX","HOLX",
    "BAX","BDX","COO","DXCM","EW","HSIC","ALGN","RMD","STE","WST",
    "MTD","PODD","TER","ZBRA","CTAS","CINF","LH","DGX","DVA","UHS",
    "THC","CNC","MOH",
    "T","VZ","TMUS","CHTR","CMCSA","DIS","WBD","FOX","FOXA",
    "OMC","IPG","SBAC","AMT","CCI","EQIX","EXR","IRM","ARE","BXP",
    "KIM","REG","FRT","SPG",
    "NEE","AEP","EXC","PCG","ED","AEE","WEC","ETR","PPL","FE","ES","CMS",
    "NI","PNW","XEL","ATO","CNP","NRG","DTE","LNT",
    "AWK","GWW","FAST","ODFL","CHRW","EXPD","UPS","FDX","DAL","UAL","ALK","LUV","AAL",
    "JBHT","SAIA","WERN","KNX","XPO",
    "TGT","DG","DLTR","ROST","BURL","KSS","M",
    "URBN","ANF","AEO","RL","PVH","CPRI","TPR","HBI","VFC",
    "FL","CROX","DECK",
    "PYPL","SQ","SOFI","LC","UPST",
    "SNOW","DDOG","ZS","NET","CRWD","OKTA","PANW","FTNT","S","VRNS",
    "NOW","WDAY","TEAM","ADSK","PTC","CDNS","MANH","PAYC",
    "HUBS","PCTY","VEEV","ESTC","MDB","DOCN",
    "U","RBLX","COIN","MKTX","VIRT","LPLA",
    "CVS",
    "AME","FTV","ROP","IDEX","NDSN","PH","CARR","OTIS","IR","TT","XYL","A",
    "KEYS","TRMB","RGEN","FBIN","CPRT","PAYX","AJG","WTW","MKL",
    "SWK","SNA","PNR","RRX","GGG","GNRC","EFX","VRSK","BR","FDS","MSCI",
    "MCO","CBOE","NDAQ","IEX","TW","SEIC","NTRS","STT","BEN","IVZ",
    "TROW","AMG","FHN","CFG","FITB","HBAN","MTB","ZION","CMA",
    "WAL","EWBC","FCNCA","OFG","GBCI","CATY","FFIN","HTLF","BPOP",
    "CBSH","ABCB","SFNC","IBCP","IBOC","TBK","FBIZ","NBTB","NFBK","CTBI",
    "CCBG","HFWA","BMRC","BSVN","OBNK","BANR","HMNF","OFED","SBCF",
    "PFIS","RNST","SRCE","STBA","TCBK","UVSP","WINA","WSFS","HIFS",
    # Additional liquid names
    "AMAT","LRCX","KLAC","MCHP","MPWR","SWKS","QRVO","AKAM","VRT","SMCI",
    "ARM","NXPI","ON","STX","WDC","HPE","HPQ","NTAP","PSTG","PRGO",
    "BAH","LDOS","SAIC","CACI","PLTR","AI","BBAI","DXC",
    "MTZ","PWR","STRL","APOG","STRA","LOGI","ROKU","SPOT","SNAP",
    "PINS","TWLO","ZM","DOCU","BILL","TOST","APP","DKNG","DASH",
]
# Deduplicate while preserving order
_seen: set = set()
SP500_UNIVERSE = [s for s in SP500_UNIVERSE if not (s in _seen or _seen.add(s))]  # type: ignore[func-returns-value]


# ── Bull Assistant's Built-in Playbook ───────────────────────────────────────
# Concrete rules checkable from EOD + options snapshot data.
# Exposed via GET /api/bull/assistant-playbook so the user can read and adopt them.

BULL_ASSISTANT_PLAYBOOK = [
    "SPY and QQQ must both be in bullish regime (close above 50-day SMA) — no bullish credit spreads against the macro trend",
    "Stock must be trading above its own 50-day SMA — only sell puts below an uptrending name",
    "RSI(14) must be between 35 and 65 — avoids names that are overbought (>65) or already breaking down (<35)",
    "Stock's sector ETF must be strong or neutral — avoid selling puts in a weak sector",
    "ATM implied volatility proxy (IV × 100) must be at least 25 — minimum premium to make the credit spread worthwhile",
    "ATM open interest must be at least 300 — confirms the strike is liquid enough to enter and exit cleanly",
]


# ── Batch EOD Snapshot (yfinance) ────────────────────────────────────────────

def _batch_eod_snapshots(symbols: list) -> dict:
    """
    Fetch EOD technicals for all symbols in one yfinance batch call.
    Replaces the per-symbol TwelveData/Finnhub loop — ~30s vs ~50min.
    Returns dict keyed by symbol with same shape as get_eod_snapshot().
    """
    try:
        import yfinance as yf
        data = yf.download(
            tickers=symbols,
            period="3mo",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as e:
        _log.warning("yf.download batch failed: %s", e)
        return {}

    snapshots = {}
    for sym in symbols:
        try:
            df = data[sym].dropna(subset=["Close", "Volume"])
            if len(df) < 21:
                continue
            closes = df["Close"].tolist()
            volumes = df["Volume"].tolist()
            if len(closes) < 21:
                continue
            close = float(closes[-1])
            if math.isnan(close):
                continue
            sma50 = sum(closes[-50:]) / min(50, len(closes))
            avg_vol_20d = int(sum(volumes[-20:]) / 20)
            diffs = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
            gains = [max(d, 0) for d in diffs]
            losses = [max(-d, 0) for d in diffs]
            avg_gain = sum(gains[-14:]) / 14 if len(gains) >= 14 else 0
            avg_loss = sum(losses[-14:]) / 14 if len(losses) >= 14 else 0
            rsi14 = 100.0 if avg_loss == 0 else round(100 - (100 / (1 + avg_gain / avg_loss)), 2)
            snapshots[sym] = {
                "symbol": sym,
                "close": close,
                "sma50": round(float(sma50), 4),
                "rsi14": rsi14,
                "volume": float(volumes[-1]),
                "avg_volume_20d": avg_vol_20d,
            }
        except Exception:
            continue
    return snapshots


# ── Stage 1 Screener ──────────────────────────────────────────────────────────

def stage1_filter(snapshots: dict) -> list:
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


# ── Stage 2 Screener ──────────────────────────────────────────────────────────

def stage2_filter(candidates: list, options_provider) -> list:
    """
    Stage 2: options liquidity filter.
    Thresholds: ivr >= 20, atm_oi >= 200, atm_spread_pct <= 0.15
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
        if opts.get("atm_oi", 0) < 200:
            continue
        if opts.get("atm_spread_pct", 1.0) > 0.15:
            continue
        passed.append({**snap, **opts})
    return passed


# ── Claude Haiku Batch Scoring ────────────────────────────────────────────────

_api_key = os.getenv("ANTHROPIC_API_KEY", "")


def _build_score_prompt(candidates: list, macro: dict, sectors: list, playbook_rules: list) -> str:
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
    candidate_blocks = "\n".join(
        f"<candidate symbol='{c['symbol']}'>\n"
        f"  sector: {c.get('sector', 'unknown')} ({c.get('sector_label', 'neutral')})\n"
        f"  close: ${c.get('close', 0):.2f}  sma50: ${c.get('sma50', 0):.2f}\n"
        f"  rsi14: {c.get('rsi14', 0):.1f}\n"
        f"  iv: {c.get('iv', 0):.1%}  ivr_proxy: {c.get('ivr', 0):.0f}\n"
        f"  atm_oi: {c.get('atm_oi', 0)}\n"
        f"</candidate>"
        for c in candidates
    )

    asst_numbered = "\n".join(f"{i+1}. {r}" for i, r in enumerate(BULL_ASSISTANT_PLAYBOOK))

    if playbook_rules:
        user_numbered = "\n".join(f"{i+1}. {r}" for i, r in enumerate(playbook_rules))
        user_block = f"""USER PLAYBOOK (score as user_total):
{user_numbered}

Score 0-10: (rules clearly met) / (total rules) × 10.
In user_rationale mark each rule ✓ met / ✗ not met / ? unclear, then state the score.
Example: "RSI=52 ✓ rule 1. Above SMA50 ✓ rule 2. IV=18 ✗ rule 3. Score 6.7/10."
Only use data provided. Do NOT invent criteria."""
    else:
        user_block = "USER PLAYBOOK: none saved. Set user_total=\"—\" and user_rationale=\"No playbook rules — add rules in the Playbook page.\""

    return f"""You are a swing trading assistant evaluating bull put spread candidates using EOD closing data.

MARKET CONTEXT:
{macro_text}

SECTOR RANKINGS (strongest first):
{sector_lines}

Score each candidate against TWO playbooks:

{user_block}

BULL ASSISTANT PLAYBOOK (score as asst_total):
{asst_numbered}

Score 0-10: (rules clearly met) / 6 × 10.
In asst_rationale mark each rule ✓ met / ✗ not met / ? unclear, then state the score.

CANDIDATES:
{candidate_blocks}

Respond in this EXACT XML format (include ALL candidates):
<scores>
<score symbol="SYMBOL" user_total="7.5" asst_total="8.3">
<user_rationale>Per-rule verdict for user playbook.</user_rationale>
<asst_rationale>Per-rule verdict for assistant playbook.</asst_rationale>
</score>
</scores>"""


def _parse_scores(xml_text: str, candidates: list) -> list:
    import re
    results = []
    candidate_map = {c["symbol"]: c for c in candidates}
    for match in re.finditer(
        r'<score symbol="([^"]+)" user_total="([^"]+)" asst_total="([^"]+)"[^>]*>'
        r'\s*<user_rationale>([^<]*)</user_rationale>'
        r'\s*<asst_rationale>([^<]*)</asst_rationale>',
        xml_text,
        re.DOTALL,
    ):
        sym = match.group(1)
        if sym not in candidate_map:
            continue
        candidate = dict(candidate_map[sym])
        user_raw = match.group(2).strip()
        try:
            candidate["score"] = float(user_raw)
        except (ValueError, AttributeError):
            candidate["score"] = None
        try:
            candidate["asst_score"] = float(match.group(3))
        except ValueError:
            candidate["asst_score"] = 0.0
        candidate["rationale"] = match.group(4).strip()
        candidate["asst_rationale"] = match.group(5).strip()
        results.append(candidate)
    scored_syms = {r["symbol"] for r in results}
    for c in candidates:
        if c["symbol"] not in scored_syms:
            results.append({**c, "score": None, "asst_score": 0.0,
                            "rationale": "Not scored.", "asst_rationale": "Not scored."})
    return sorted(results, key=lambda x: x.get("asst_score") or 0, reverse=True)


def score_candidates(candidates: list, macro: dict, sectors: list, playbook_rules: list) -> list:
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


# ── Position Sizing ───────────────────────────────────────────────────────────

def compute_macro_regime(candles: list) -> str:
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


# ── Pipeline Orchestrator ─────────────────────────────────────────────────────

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


def run_pipeline(options_provider, playbook_rules: list, bull_profile: dict) -> dict:
    """
    Full daily scan pipeline. Returns dict with macro, sectors, candidates.
    Each candidate includes score, rationale, and sizing.
    """
    from backend.services.market import get_sector_etfs, _fetch_candles, SECTOR_ETFS

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

    # 3. Build sector map for candidate enrichment (symbol → nearest sector ETF)
    sector_map: dict = {}
    for sym in SP500_UNIVERSE:
        for etf in SECTOR_ETFS:
            sector_map.setdefault(sym, etf)
            break

    # 4. Stage 1: batch fetch EOD snapshots and filter
    raw_snapshots = _batch_eod_snapshots(SP500_UNIVERSE)
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
