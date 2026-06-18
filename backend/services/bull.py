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

# ── Symbol → Sector ETF mapping ───────────────────────────────────────────────
_SYMBOL_SECTOR: dict = {
    **{s: "XLK" for s in [
        "AAPL","MSFT","NVDA","AVGO","ORCL","CRM","AMD","TXN","ADBE","INTU","QCOM","IBM",
        "AMAT","LRCX","KLAC","MCHP","MPWR","SWKS","QRVO","NXPI","ON","STX","WDC",
        "HPE","HPQ","NTAP","PSTG","SMCI","ARM","VRT","PLTR","AI","BBAI","DXC","AKAM",
        "CSCO","CDNS","MANH","PAYC","HUBS","PCTY","VEEV","ESTC","MDB","DOCN",
        "SNOW","DDOG","ZS","NET","CRWD","OKTA","PANW","FTNT","S","VRNS",
        "NOW","WDAY","TEAM","ADSK","PTC","KEYS","TRMB","LOGI","TER","ZBRA","BR","EFX","VRSK",
    ]},
    **{s: "XLC" for s in [
        "GOOGL","GOOG","META","NFLX","DIS","T","VZ","TMUS","CHTR","CMCSA",
        "WBD","FOX","FOXA","OMC","IPG","APP","SNAP","PINS","RBLX","ROKU",
        "SPOT","TWLO","DASH","DKNG","ZM","DOCU","BILL","TOST","U",
    ]},
    **{s: "XLF" for s in [
        "JPM","BAC","WFC","MS","GS","C","USB","PNC","TFC","RF","KEY","SCHW",
        "BK","COF","AIG","PRU","MET","TRV","ALL","AFL","HIG","L",
        "SPGI","MCO","CBOE","NDAQ","CME","ICE","BLK","AXP","V","MA",
        "PYPL","SQ","SOFI","LC","UPST","COIN","MKTX","VIRT","LPLA",
        "FHN","CFG","FITB","HBAN","ZION","CMA","WAL","EWBC","FCNCA","OFG",
        "GBCI","CATY","FFIN","HTLF","BPOP","CBSH","ABCB","SFNC","IBCP",
        "IBOC","TBK","FBIZ","NBTB","NFBK","CTBI","CCBG","HFWA","BMRC",
        "BSVN","OBNK","BANR","HMNF","OFED","SBCF","PFIS","RNST","SRCE",
        "STBA","TCBK","UVSP","WINA","WSFS","HIFS","TROW","AMG","FDS","MSCI",
        "NTRS","STT","BEN","IVZ","IEX","TW","AJG","WTW","MKL","MTB","FIS",
    ]},
    **{s: "XLV" for s in [
        "LLY","UNH","JNJ","ABBV","MRK","TMO","ABT","DHR","MDT","AMGN",
        "VRTX","GILD","ELV","SYK","ISRG","ZTS","BSX","CI","HUM","MCK",
        "HCA","PFE","BMY","BIIB","MRNA","ILMN","A","IQV","CRL","IDXX",
        "HOLX","BAX","BDX","COO","DXCM","EW","HSIC","ALGN","RMD","STE",
        "WST","MTD","PODD","DVA","UHS","THC","CNC","MOH","PRGO","RGEN",
    ]},
    **{s: "XLE" for s in [
        "XOM","CVX","COP","SLB","EOG","MPC","PSX","VLO","OXY","HAL",
    ]},
    **{s: "XLY" for s in [
        "AMZN","TSLA","HD","MCD","COST","LOW","TGT","DG","DLTR","ROST",
        "BURL","KSS","M","NKE","URBN","ANF","AEO","RL","PVH","CPRI",
        "TPR","HBI","VFC","FL","CROX","DECK","F","GM","UBER","BKNG",
    ]},
    **{s: "XLP" for s in [
        "PG","KO","PEP","PM","WMT","MO","CL","CVS",
    ]},
    **{s: "XLI" for s in [
        "GE","HON","CAT","DE","RTX","NOC","LMT","GD","EMR","ITW",
        "ADP","CTAS","FAST","ODFL","CHRW","EXPD","UPS","FDX",
        "DAL","UAL","ALK","LUV","AAL","JBHT","SAIA","WERN","KNX","XPO",
        "AME","FTV","ROP","IDEX","NDSN","PH","CARR","OTIS","IR","TT","XYL",
        "SWK","SNA","PNR","RRX","GGG","GNRC","PAYX",
        "MTZ","PWR","STRL","BAH","LDOS","SAIC","CACI","WM","GWW","CPRT",
    ]},
    **{s: "XLB" for s in [
        "LIN","APD","ECL","SHW","DD","PPG","NEM","FCX",
    ]},
    **{s: "XLRE" for s in [
        "PLD","PSA","AMT","CCI","EQIX","EXR","IRM","ARE","BXP",
        "KIM","REG","FRT","SPG","SBAC",
    ]},
    **{s: "XLU" for s in [
        "NEE","AEP","EXC","PCG","ED","AEE","WEC","ETR","PPL","FE",
        "ES","CMS","NI","PNW","XEL","ATO","CNP","NRG","DTE","LNT","AWK","D","SO","DUK",
    ]},
}


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


# ── Channel + RSI slope helpers ───────────────────────────────────────────────

def _channel_proximity(closes: list, highs: list, lows: list) -> dict:
    """
    Fits linear regression on 20-day highs and lows to detect channel direction
    and how close the current price is to the lower band.
    Returns {slope: float, proximity_pct: float, passes: bool}.
    proximity_pct: 0 = at lower band, 1 = at upper band.
    passes: slope > 0 and proximity_pct <= 0.25.
    """
    import numpy as np
    if len(highs) < 20 or len(lows) < 20 or len(closes) < 20:
        return {"slope": 0.0, "proximity_pct": 0.5, "passes": False}
    x = list(range(20))
    upper_coef = np.polyfit(x, highs[-20:], 1)
    lower_coef = np.polyfit(x, lows[-20:], 1)
    channel_slope = float(lower_coef[0])
    lower_val = float(np.polyval(lower_coef, 19))
    upper_val = float(np.polyval(upper_coef, 19))
    channel_range = upper_val - lower_val
    if channel_range <= 0:
        return {"slope": channel_slope, "proximity_pct": 0.5, "passes": False}
    proximity_pct = float((closes[-1] - lower_val) / channel_range)
    passes = channel_slope > 0 and 0 <= proximity_pct <= 0.25
    return {"slope": channel_slope, "proximity_pct": proximity_pct, "passes": passes}


def _channel_context_60d(closes: list, highs: list, lows: list) -> dict:
    """
    60-day channel sanity gate. Prevents the 20-day channel from firing on a
    breakout anomaly: a stock in the top half of its 60-day channel is extended,
    not at support, regardless of where the 20-day lower band sits.
    Returns {slope: float, proximity_pct: float, passes_gate: bool}.
    passes_gate: True only when 60d slope > 0 AND close is in bottom 50% of 60d channel.
    If fewer than 60 bars available, passes_gate = True (graceful fallback to 20d only).
    """
    import numpy as np
    if len(highs) < 60 or len(lows) < 60 or len(closes) < 60:
        return {"slope": 0.0, "proximity_pct": 0.5, "passes_gate": True}
    x = list(range(60))
    upper_coef = np.polyfit(x, highs[-60:], 1)
    lower_coef = np.polyfit(x, lows[-60:], 1)
    channel_slope = float(lower_coef[0])
    lower_val = float(np.polyval(lower_coef, 59))
    upper_val = float(np.polyval(upper_coef, 59))
    channel_range = upper_val - lower_val
    if channel_range <= 0:
        return {"slope": channel_slope, "proximity_pct": 0.5, "passes_gate": False}
    proximity_pct = float((closes[-1] - lower_val) / channel_range)
    passes_gate = channel_slope > 0 and proximity_pct <= 0.50
    return {"slope": channel_slope, "proximity_pct": proximity_pct, "passes_gate": passes_gate}


def _rsi_slope(closes: list) -> float:
    """
    Returns the slope of RSI(14) over the last 3 bars (change per bar).
    Positive means RSI is turning upward. Returns 0.0 if fewer than 22 bars.
    """
    if len(closes) < 22:
        return 0.0

    def _rsi14(series: list) -> float:
        diffs = [series[i] - series[i - 1] for i in range(1, len(series))]
        gains = [max(d, 0.0) for d in diffs[-14:]]
        losses = [max(-d, 0.0) for d in diffs[-14:]]
        avg_gain = sum(gains) / 14
        avg_loss = sum(losses) / 14
        if avg_loss == 0:
            return 100.0
        return 100.0 - 100.0 / (1 + avg_gain / avg_loss)

    rsi_t0 = _rsi14(closes[:-2])   # 2 bars ago
    rsi_t2 = _rsi14(closes)         # today
    return (rsi_t2 - rsi_t0) / 2    # slope: change per bar


def deterministic_score(candidate: dict, macro: dict) -> dict:
    """
    Returns {total, channel_pts, rsi_pts, volume_pts, macro_pts, options_pts}.
    Each component is capped at its individual max so no single dimension can
    inflate the total beyond its allocation.
    Channel proximity (25), RSI slope (20), Volume ratio (15),
    Macro alignment (20), Options quality (20).
    """
    # Channel proximity: capped at 25. Negative proximity (below channel) = 0.
    prox = candidate.get("channel_proximity_pct")
    channel_pts = 0
    if prox is not None and float(prox) >= 0:
        channel_pts = min(25, max(0, int(25 * (1.0 - float(prox) / 0.25))))

    # RSI slope: 20 pts linear, 20 at slope>=3, 0 at slope<=0
    rsi_slope_val = float(candidate.get("rsi_slope") or 0.0)
    rsi_pts = max(0, min(20, int(20 * min(rsi_slope_val, 3.0) / 3.0)))

    # Volume ratio: stepped
    vol_ratio = float(candidate.get("volume_ratio") or 0.0)
    volume_pts = 15 if vol_ratio >= 1.2 else (10 if vol_ratio >= 0.8 else 0)

    # Macro alignment
    spy_regime = (macro.get("spy") or {}).get("regime", "neutral")
    qqq_regime = (macro.get("qqq") or {}).get("regime", "neutral")
    bullish_count = sum(1 for r in [spy_regime, qqq_regime] if r == "bullish")
    macro_pts = 20 if bullish_count == 2 else (10 if bullish_count == 1 else 0)

    # Options quality
    dq = candidate.get("data_quality", "price_only")
    options_pts = 0
    if dq == "complete":
        oi = int(candidate.get("atm_oi") or 0)
        bid = float(candidate.get("atm_bid") or 0.0)
        if oi >= 500 and bid >= 0.50:
            options_pts = 20
        elif oi >= 200 and bid >= 0.30:
            options_pts = 12

    total = min(100, channel_pts + rsi_pts + volume_pts + macro_pts + options_pts)
    return {
        "total": total,
        "channel_pts": channel_pts,
        "rsi_pts": rsi_pts,
        "volume_pts": volume_pts,
        "macro_pts": macro_pts,
        "options_pts": options_pts,
    }


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
            period="6mo",
            interval="1d",
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
            if len(df) < 50:
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
            highs = df["High"].tolist()
            lows = df["Low"].tolist()
            snapshots[sym] = {
                "symbol": sym,
                "close": close,
                "sma50": round(float(sma50), 4),
                "rsi14": rsi14,
                "volume": float(volumes[-1]),
                "avg_volume_20d": avg_vol_20d,
                "closes": [float(c) for c in closes[-65:]],
                "highs": [float(h) for h in highs[-65:]],
                "lows": [float(l) for l in lows[-65:]],
            }
        except Exception:
            continue
    return snapshots


# ── Stage 1 Screener ──────────────────────────────────────────────────────────

def stage1_filter(snapshots: dict) -> list:
    """
    Stage 1: channel-proximity filter.
    Passes: close > $15, avg_volume_20d > 500k, upward channel (slope > 0),
    price in bottom 25% of channel (proximity_pct <= 0.25), RSI slope positive.
    Returns top 20 sorted by channel proximity ascending (closest to support first).
    """
    passed = []
    for sym, snap in snapshots.items():
        if snap is None:
            continue
        if snap.get("close", 0) <= 15:
            continue
        if (snap.get("avg_volume_20d") or 0) < 500_000:
            continue
        closes = snap.get("closes", [])
        highs = snap.get("highs", [])
        lows = snap.get("lows", [])
        if len(closes) < 22 or len(highs) < 20 or len(lows) < 20:
            continue
        channel = _channel_proximity(closes, highs, lows)
        if not channel["passes"]:
            continue
        ctx60 = _channel_context_60d(closes, highs, lows)
        if not ctx60["passes_gate"]:
            continue
        rsi_slope_val = _rsi_slope(closes)
        if rsi_slope_val <= 0:
            continue
        volume_ratio = (snap.get("volume") or 0) / max(snap.get("avg_volume_20d") or 1, 1)
        passed.append({
            **snap,
            "channel_slope": channel["slope"],
            "channel_proximity_pct": channel["proximity_pct"],
            "rsi_slope": rsi_slope_val,
            "volume_ratio": volume_ratio,
        })
    passed.sort(key=lambda x: x.get("channel_proximity_pct", 1.0))
    return passed[:20]


# ── Stage 2 Screener ──────────────────────────────────────────────────────────

def stage2_options_check(candidates: list, options_provider) -> list:
    """
    Stage 2: per-ticker options quality check using OptionsProvider interface.
    Assigns data_quality: 'complete' (bid>=0.30 + oi>=200), 'partial', or 'price_only'.
    Returns candidates sorted: complete first, partial second, price_only last.
    """
    result = []
    for c in candidates:
        sym = c["symbol"]
        close = float(c.get("close") or 100.0)
        expiry = options_provider.get_nearest_weekly_expiry(sym)
        if expiry is None:
            result.append({**c, "data_quality": "price_only"})
            continue
        chain = options_provider.get_chain(sym, expiry)
        puts = chain.get("puts", [])
        if not puts:
            result.append({**c, "data_quality": "price_only", "expiry": expiry})
            continue
        atm = min(puts, key=lambda p: abs(p["strike"] - close))
        atm_bid = float(atm.get("bid") or 0.0)
        atm_oi = int(atm.get("oi") or 0)
        atm_iv = float(atm.get("iv") or 0.0)
        if atm_bid >= 0.30 and atm_oi >= 200:
            data_quality = "complete"
        elif atm_iv > 0 or atm_bid > 0:
            data_quality = "partial"
        else:
            data_quality = "price_only"
        result.append({
            **c,
            "data_quality": data_quality,
            "expiry": expiry,
            "short_strike": atm["strike"],
            "long_strike": round(atm["strike"] - 5, 2),
            "atm_bid": atm_bid,
            "atm_oi": atm_oi,
            "atm_iv": atm_iv,
            "estimated_credit": round(atm_bid * 0.85, 2),
        })
        complete_count = sum(1 for r in result if r.get("data_quality") == "complete")
        if complete_count >= 8:
            break
    quality_order = {"complete": 0, "partial": 1, "price_only": 2}
    result.sort(key=lambda x: quality_order.get(x.get("data_quality", "price_only"), 2))
    return result


# ── Claude Haiku Batch Scoring ────────────────────────────────────────────────

_api_key = os.getenv("ANTHROPIC_API_KEY", "")


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
    Full daily scan pipeline.
    Stage 1: channel + RSI slope filter (top 20).
    Stage 2: options quality check (data_quality flags).
    Scoring: deterministic 0-100 (no Claude Haiku).
    Briefs: Claude Sonnet per complete candidate (parallel).
    Returns {macro, sectors, candidates}.
    """
    import concurrent.futures
    from backend.services.market import get_sector_etfs
    from backend.services.claude import generate_setup_brief

    # 1. Macro regime
    macro_snaps = _batch_eod_snapshots(["SPY", "QQQ"])
    spy_snap = macro_snaps.get("SPY", {})
    qqq_snap = macro_snaps.get("QQQ", {})

    def _regime(close: float, sma50: float) -> str:
        if close > sma50 * 1.005:
            return "bullish"
        if close < sma50 * 0.995:
            return "bearish"
        return "neutral"

    macro = {
        "spy": {
            "regime": _regime(spy_snap.get("close", 0), spy_snap.get("sma50", 0)),
            "close": spy_snap.get("close", 0),
            "sma50": round(spy_snap.get("sma50", 0), 2),
        },
        "qqq": {
            "regime": _regime(qqq_snap.get("close", 0), qqq_snap.get("sma50", 0)),
            "close": qqq_snap.get("close", 0),
        },
    }

    # 2. Sectors
    sectors = get_sector_etfs()
    sector_label_map = {s["symbol"]: s["label"] for s in sectors}

    # 3. Stage 1: batch snapshot + channel filter → top 20
    raw_snapshots = _batch_eod_snapshots(SP500_UNIVERSE)
    stage1 = stage1_filter(raw_snapshots)

    # 4. Enrich with sector info
    for c in stage1:
        c_sector = _SYMBOL_SECTOR.get(c["symbol"], "unknown")
        c["sector"] = c_sector
        c["sector_label"] = sector_label_map.get(c_sector, "neutral")

    # 5. Stage 2: options quality check
    candidates = stage2_options_check(stage1, options_provider)

    # 6. Deterministic scoring
    for c in candidates:
        breakdown = deterministic_score(c, macro)
        c["score"] = breakdown["total"]
        c["score_breakdown"] = {
            "channel": breakdown["channel_pts"],
            "rsi": breakdown["rsi_pts"],
            "volume": breakdown["volume_pts"],
            "macro": breakdown["macro_pts"],
            "options": breakdown["options_pts"],
        }
    candidates.sort(key=lambda x: x.get("score", 0), reverse=True)

    # 7. Setup briefs for complete candidates (parallel Sonnet calls)
    complete = [c for c in candidates if c.get("data_quality") == "complete"]

    def _brief(c):
        return c["symbol"], generate_setup_brief(c, macro, sectors)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        briefs = dict(executor.map(_brief, complete))

    for c in candidates:
        c["setup_brief"] = briefs.get(c["symbol"], "")

    # 8. Attach position sizing
    profile = bull_profile or {}
    account_size = float(profile.get("account_size", 0))
    risk_pct = float(profile.get("risk_per_trade_pct", 1.0))
    max_contracts = int(profile.get("max_contracts", 5))
    for c in candidates:
        spread_width = (c.get("short_strike") or 0) - (c.get("long_strike") or 0)
        premium = float(c.get("estimated_credit") or 0)
        atm_strike = float(c.get("short_strike") or c.get("close") or 100)
        sizing = compute_sizing(atm_strike, spread_width or 5.0, premium, account_size, risk_pct, max_contracts)
        c.update(sizing)

    return _sanitize({"macro": macro, "sectors": sectors, "candidates": candidates})


def _sanitize(obj):
    """Recursively replace NaN/inf floats with None so JSON serialization never fails."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj
