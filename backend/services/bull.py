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


_RSI_SLOPE_LOOKBACK = 5


def _rsi_slope(closes: list) -> float:
    """
    Slope of RSI(14) over the last 5 bars, fit by linear regression.
    Positive means RSI is trending upward. Units are RSI points per bar.

    The previous 2-point method (today vs 2 bars ago) was noisy — one
    strong day would make the slope look great even if the underlying
    RSI trend was flat. Fitting a line across 5 bars smooths that.

    Returns 0.0 when there are fewer than 14 + LOOKBACK bars (RSI needs
    15 closes for its first reading, then LOOKBACK-1 more to fit the line).
    """
    import numpy as np
    if len(closes) < 14 + _RSI_SLOPE_LOOKBACK:
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

    n = len(closes)
    rsi_values = [
        _rsi14(closes[: n - (_RSI_SLOPE_LOOKBACK - 1 - i)])
        for i in range(_RSI_SLOPE_LOOKBACK)
    ]
    x = np.arange(_RSI_SLOPE_LOOKBACK)
    slope, _ = np.polyfit(x, rsi_values, 1)
    return float(slope)


def deterministic_score(candidate: dict, macro: dict) -> dict:
    """
    Total score = setup_score (max 60) + context bonuses (max 40), clamped 100.

    Setup score (60): whichever of the 4 parallel detectors scored highest.
      Filled in during stage1_filter → candidate["setup_score"], candidate["setup_type"].
    Context bonuses (40):
      Macro alignment .......... 10  (SPY + QQQ regime)
      Volume ratio ............. 10  (today vs 20d avg)
      52w volume rank .......... 5
      Relative strength bonus .. 5   (vs SPY over 20d)
      Options quality .......... 10  (stage 2 fills in — 0 for price_only rows)
    """
    setup_score = int(candidate.get("setup_score") or 0)
    setup_type  = candidate.get("setup_type") or "none"

    # ── Context ──
    spy_regime = (macro.get("spy") or {}).get("regime", "neutral")
    qqq_regime = (macro.get("qqq") or {}).get("regime", "neutral")
    bullish_count = sum(1 for r in [spy_regime, qqq_regime] if r == "bullish")
    macro_pts = 10 if bullish_count == 2 else (5 if bullish_count == 1 else 0)

    vol_ratio = float(candidate.get("volume_ratio") or 0.0)
    volume_pts = 10 if vol_ratio >= 1.2 else (7 if vol_ratio >= 0.8 else 0)

    vol_pct_rank = float(candidate.get("vol_52w_pct_rank") or 0.0)
    vol_rank_pts = 5 if vol_pct_rank >= 95 else (3 if vol_pct_rank >= 80 else 0)

    rs_20d = float(candidate.get("rs_20d") or 0.0)
    rs_pts = 5 if rs_20d >= 5.0 else 0

    dq = candidate.get("data_quality", "price_only")
    options_pts = 0
    if dq == "complete":
        oi = int(candidate.get("atm_oi") or 0)
        bid = float(candidate.get("atm_bid") or 0.0)
        if oi >= 500 and bid >= 0.50:
            options_pts = 10
        elif oi >= 200 and bid >= 0.30:
            options_pts = 6

    total = min(100, setup_score + macro_pts + volume_pts + vol_rank_pts + rs_pts + options_pts)

    # ── Justifications ──
    setup_scores = candidate.get("setup_scores") or {}
    setup_why = (
        f"{SETUP_LABELS.get(setup_type, setup_type)}: {setup_score}/60"
        + (f" (other setups: " + ", ".join(f"{SETUP_LABELS.get(k, k)} {v}" for k, v in setup_scores.items() if k != setup_type and v > 0) + ")"
           if any(v > 0 for k, v in setup_scores.items() if k != setup_type) else "")
    )
    spy_label = spy_regime.capitalize(); qqq_label = qqq_regime.capitalize()
    macro_why = f"SPY {spy_label} · QQQ {qqq_label}"
    if vol_ratio >= 1.2:
        volume_why = f"Volume {vol_ratio:.2f}× 20-day avg — strong confirmation"
    elif vol_ratio >= 0.8:
        volume_why = f"Volume {vol_ratio:.2f}× 20-day avg — adequate"
    else:
        volume_why = f"Volume {vol_ratio:.2f}× 20-day avg — below average"
    if vol_rank_pts >= 5:
        vol_rank_why = f"Top 5% of 52-week volume ({vol_pct_rank:.0f}th pct)"
    elif vol_rank_pts >= 3:
        vol_rank_why = f"Top 20% of 52-week volume ({vol_pct_rank:.0f}th pct)"
    else:
        vol_rank_why = f"52w volume rank {vol_pct_rank:.0f}th pct"
    if rs_pts >= 5:
        rs_why = f"Outperforming SPY by {rs_20d:+.1f} pts over last 20d"
    elif rs_20d >= 0:
        rs_why = f"In line with SPY ({rs_20d:+.1f} pts over last 20d)"
    else:
        rs_why = f"Trailing SPY by {rs_20d:+.1f} pts over last 20d"
    if dq == "price_only":
        options_why = "No options data available"
    elif dq == "partial":
        options_why = "Options data incomplete"
    else:
        oi = int(candidate.get("atm_oi") or 0)
        bid = float(candidate.get("atm_bid") or 0.0)
        iv_pct = round((candidate.get("atm_iv") or 0) * 100, 0)
        options_why = f"ATM bid ${bid:.2f} · OI {oi:,} · IV {iv_pct:.0f}%"

    return {
        "total": total,
        "setup_type":   setup_type,
        "setup_score":  setup_score,
        "setup_why":    setup_why,
        "setup_scores": setup_scores,
        "macro_pts":    macro_pts,    "macro_why":    macro_why,
        "volume_pts":   volume_pts,   "volume_why":   volume_why,
        "vol_rank_pts": vol_rank_pts, "vol_rank_why": vol_rank_why,
        "rs_pts":       rs_pts,       "rs_why":       rs_why,
        "options_pts":  options_pts,  "options_why":  options_why,
    }


# ── Batch EOD Snapshot (yfinance) ────────────────────────────────────────────

def _compute_volume_52w(volumes: list, dates: list) -> dict:
    """Summarize the last ~252 trading days of volume.

    Returns:
      vol_52w_max: int             — largest single-day volume in the window
      vol_52w_max_date: str|None   — ISO date of that bar
      vol_52w_pct_rank: float      — today's volume percentile within the window (0-100)
      vol_52w_ratio: float         — today's volume / 52w max (0-1)
    """
    window = volumes[-252:] if len(volumes) > 252 else volumes
    window_dates = dates[-len(window):] if dates else []
    if not window:
        return {"vol_52w_max": 0, "vol_52w_max_date": None, "vol_52w_pct_rank": 0.0, "vol_52w_ratio": 0.0}
    max_vol = max(window)
    max_idx = window.index(max_vol)
    max_date = window_dates[max_idx] if max_idx < len(window_dates) else None
    today_vol = window[-1]
    below_or_equal = sum(1 for v in window if v <= today_vol)
    pct_rank = round(below_or_equal / len(window) * 100, 1)
    ratio = round(today_vol / max_vol, 3) if max_vol > 0 else 0.0
    return {
        "vol_52w_max": int(max_vol),
        "vol_52w_max_date": max_date,
        "vol_52w_pct_rank": pct_rank,
        "vol_52w_ratio": ratio,
    }


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
            period="1y",           # was 6mo — need ~252 trading days for 52w volume window
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
            dates = [str(d.date()) for d in df.index]
            if len(closes) < 21:
                continue
            close = float(closes[-1])
            if math.isnan(close):
                continue
            sma20  = sum(closes[-20:]) / min(20, len(closes))
            sma50  = sum(closes[-50:]) / min(50, len(closes))
            sma150 = sum(closes[-150:]) / min(150, len(closes)) if len(closes) >= 150 else None
            avg_vol_20d = int(sum(volumes[-20:]) / 20)
            diffs = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
            gains = [max(d, 0) for d in diffs]
            losses = [max(-d, 0) for d in diffs]
            avg_gain = sum(gains[-14:]) / 14 if len(gains) >= 14 else 0
            avg_loss = sum(losses[-14:]) / 14 if len(losses) >= 14 else 0
            rsi14 = 100.0 if avg_loss == 0 else round(100 - (100 / (1 + avg_gain / avg_loss)), 2)
            highs = df["High"].tolist()
            lows = df["Low"].tolist()
            opens = df["Open"].tolist()
            vol_52w = _compute_volume_52w(volumes, dates)
            snapshots[sym] = {
                "symbol": sym,
                "close": close,
                "sma20":  round(float(sma20), 4),
                "sma50":  round(float(sma50), 4),
                "sma150": round(float(sma150), 4) if sma150 is not None else None,
                "rsi14": rsi14,
                "volume": float(volumes[-1]),
                "avg_volume_20d": avg_vol_20d,
                "opens":  [float(o) for o in opens[-65:]],
                "closes": [float(c) for c in closes[-65:]],
                "highs":  [float(h) for h in highs[-65:]],
                "lows":   [float(l) for l in lows[-65:]],
                **vol_52w,
            }
        except Exception:
            continue
    return snapshots


# ── Setup detectors ──────────────────────────────────────────────────────────
#
# The prior selector had ONE thesis (rising channel + pullback to lower band)
# gated by a cascade of AND-filters that in aggregate passed 0.2% of the
# universe on typical days. Replaced with 4 parallel setup detectors — each
# returns 0-60 pts of match strength — plus a small set of true hard gates.
# Best-scoring setup wins for a stock; final score = setup + context bonuses.

SETUP_LABELS = {
    "pullback_uptrend": "Pullback in Uptrend",
    "base_breakout":    "Base / Breakout",
    "oversold_bounce":  "Oversold Bounce",
    "range_support":    "Range at Support",
    "none":             "No Setup",
}


def _bars_since_20d_high(highs: list) -> int:
    """Bars ago the 20d high last printed (0 = today, up to 19). Fresh pullbacks score high."""
    if len(highs) < 20:
        return 20
    window = highs[-20:]
    max_val = max(window)
    for i in range(len(window) - 1, -1, -1):
        if window[i] == max_val:
            return len(window) - 1 - i
    return 20


def _rs_20d(stock_closes: list, spy_closes: list) -> float:
    """20-day relative strength: (stock 20d return) − (SPY 20d return), in percent."""
    if len(stock_closes) < 21 or len(spy_closes) < 21:
        return 0.0
    if stock_closes[-21] <= 0 or spy_closes[-21] <= 0:
        return 0.0
    stock_ret = (stock_closes[-1] / stock_closes[-21] - 1) * 100
    spy_ret   = (spy_closes[-1]   / spy_closes[-21]   - 1) * 100
    return round(stock_ret - spy_ret, 2)


def _detect_bullish_reversal_pattern(opens: list, closes: list, highs: list, lows: list) -> Optional[str]:
    """Detect a bullish reversal pattern in the LAST 1-2 bars — the ones the trader would
    see on the chart today. Returns the pattern name or None. Order: hammer > engulfing >
    piercing_line (most specific first)."""
    if len(closes) < 2 or len(opens) < 2 or len(highs) < 2 or len(lows) < 2:
        return None
    o1, c1, h1, l1 = opens[-1], closes[-1], highs[-1], lows[-1]
    o0, c0        = opens[-2], closes[-2]
    body1 = abs(c1 - o1)
    range1 = h1 - l1
    if range1 <= 0:
        return None
    # Hammer: small body at top, long lower wick (>= 2x body), close near high
    lower_wick = min(o1, c1) - l1
    upper_wick = h1 - max(o1, c1)
    if body1 > 0 and lower_wick >= 2 * body1 and upper_wick <= body1 and c1 >= o1:
        return "hammer"
    # Bullish engulfing: prior red bar, today green bar body strictly engulfs prior body
    if c0 < o0 and c1 > o1 and c1 >= o0 and o1 <= c0:
        return "bullish_engulfing"
    # Piercing line: prior red bar, today opens below prior low, closes above midpoint of prior body
    prior_mid = (o0 + c0) / 2
    if c0 < o0 and o1 < l1 * 1.001 and c1 > prior_mid and c1 < o0:
        return "piercing_line"
    return None


def detect_pullback_uptrend(closes: list, highs: list, lows: list) -> int:
    """0-60 pts. Rising 20d channel + close in lower half + 60d agrees + fresh pullback."""
    ch20 = _channel_proximity(closes, highs, lows)
    if ch20["slope"] <= 0:
        return 0
    prox = ch20["proximity_pct"]
    if prox is None or prox < 0 or prox > 0.5:
        proximity_pts = 0
    else:
        proximity_pts = int(25 * (1 - prox / 0.5))
    slope_pts = 15
    ch60 = _channel_context_60d(closes, highs, lows)
    ctx60_pts = 10 if (ch60["slope"] > 0 and ch60["proximity_pct"] <= 0.6) else 0
    pullback_bars = _bars_since_20d_high(highs)
    fresh_pts = 10 if pullback_bars <= 3 else (5 if pullback_bars <= 7 else 0)
    return proximity_pts + slope_pts + ctx60_pts + fresh_pts


def detect_base_breakout(closes: list, highs: list, lows: list) -> int:
    """0-60 pts. Tight 20d range (low volatility base) with close near the top."""
    if len(closes) < 20:
        return 0
    from backend.services.market import _compute_rsi
    hi20 = max(highs[-20:])
    lo20 = min(lows[-20:])
    avg = sum(closes[-20:]) / 20
    if avg <= 0 or lo20 <= 0 or hi20 <= lo20:
        return 0
    range_pct = (hi20 - lo20) / avg * 100
    if range_pct < 8:
        base_pts = 30
    elif range_pct < 12:
        base_pts = 20
    elif range_pct < 18:
        base_pts = 10
    else:
        return 0
    close = closes[-1]
    pos = (close - lo20) / (hi20 - lo20)  # 1.0 = at high, 0.0 = at low
    top_pts = 15 if pos >= 0.8 else (10 if pos >= 0.6 else 5 if pos >= 0.4 else 0)
    rsi = _compute_rsi(closes, 14)
    rsi_pts = 5 if rsi is not None and 40 <= rsi <= 65 else 0
    return base_pts + top_pts + rsi_pts


def detect_oversold_bounce(closes: list, opens_: list) -> int:
    """0-60 pts. RSI reached <30 in last 10 bars and is now turning up."""
    if len(closes) < 25:
        return 0
    from backend.services.market import _compute_rsi
    rsis = []
    for i in range(10):
        # Compute RSI for the series ending i bars ago
        cutoff = len(closes) - (9 - i)
        r = _compute_rsi(closes[:cutoff], 14)
        if r is not None:
            rsis.append(r)
    if len(rsis) < 5:
        return 0
    min_rsi = min(rsis)
    cur_rsi = rsis[-1]
    if min_rsi < 25:
        dip_pts = 25
    elif min_rsi < 30:
        dip_pts = 15
    elif min_rsi < 35:
        dip_pts = 5
    else:
        return 0
    turn_pts = 15 if cur_rsi > min_rsi + 5 else (10 if cur_rsi > min_rsi + 2 else 0)
    green_pts = 10 if opens_ and closes[-1] > opens_[-1] else 0
    return dip_pts + turn_pts + green_pts


def detect_range_support(closes: list, highs: list, lows: list) -> int:
    """0-60 pts. 30d range-bound stock currently near range low."""
    if len(closes) < 30:
        return 0
    hi30 = max(highs[-30:])
    lo30 = min(lows[-30:])
    if lo30 <= 0 or hi30 <= lo30:
        return 0
    range_ratio = hi30 / lo30
    if range_ratio > 1.30:
        return 0
    close = closes[-1]
    pos = (close - lo30) / (hi30 - lo30)
    if pos > 0.35:
        return 0
    range_pts = 25 if range_ratio < 1.15 else (18 if range_ratio < 1.20 else 10)
    bottom_pts = 25 if pos < 0.15 else (18 if pos < 0.25 else 10)
    recent_low = min(lows[-5:])
    hold_pts = 10 if recent_low > lo30 * 1.005 else 0
    return range_pts + bottom_pts + hold_pts


def _score_all_setups(closes: list, highs: list, lows: list, opens_: list) -> dict:
    """Score every setup detector and pick the winner."""
    scores = {
        "pullback_uptrend": detect_pullback_uptrend(closes, highs, lows),
        "base_breakout":    detect_base_breakout(closes, highs, lows),
        "oversold_bounce":  detect_oversold_bounce(closes, opens_),
        "range_support":    detect_range_support(closes, highs, lows),
    }
    best = max(scores, key=scores.get)
    return {"scores": scores, "best_setup": best, "best_score": scores[best]}


# ── Stage 1 Screener (multi-setup) ────────────────────────────────────────────

def stage1_filter(snapshots: dict, macro_snaps: Optional[dict] = None) -> list:
    """
    Multi-setup stage 1.

    Hard gates (all required, minimal):
      - Close > $15 and avg_volume_20d > 500k (liquidity)
      - Close >= SMA50 × 0.98 (trend not broken; 2% buffer for pullbacks)
      - 20d relative strength vs SPY >= -5% (avoid falling knives)
      - >= 60 bars of data

    Then each survivor is scored by 4 parallel setup detectors:
      pullback_uptrend, base_breakout, oversold_bounce, range_support

    The candidate is tagged with the best-scoring setup + that score; the
    downstream scoring function combines this with context bonuses.

    Returns top 20 sorted by best_setup_score descending.
    """
    spy_closes = ((macro_snaps or {}).get("SPY", {}) or {}).get("closes", []) or []
    passed = []
    for sym, snap in snapshots.items():
        if snap is None:
            continue
        close_px = snap.get("close", 0)
        if close_px <= 15:
            continue
        if (snap.get("avg_volume_20d") or 0) < 500_000:
            continue
        closes = snap.get("closes", [])
        highs  = snap.get("highs", [])
        lows   = snap.get("lows", [])
        opens_ = snap.get("opens", [])
        if len(closes) < 60 or len(highs) < 60 or len(lows) < 60:
            continue
        sma20  = snap.get("sma20")  or 0.0
        sma50  = snap.get("sma50")  or 0.0
        sma150 = snap.get("sma150")
        if sma50 > 0 and close_px < sma50 * 0.98:
            continue
        # MA-retest gate: at least one of SMA20/50/150 must be within 3% of close
        # (in either direction). A stock floating above ALL three MAs has no nearby
        # support — not a bull-put setup, no matter what the local detectors say.
        mas = [m for m in (sma20, sma50, sma150) if m and m > 0]
        if mas and not any(0.97 <= close_px / m <= 1.03 for m in mas):
            continue
        rs_20d = _rs_20d(closes, spy_closes) if spy_closes else 0.0
        if rs_20d < -5.0:
            continue

        setup_result = _score_all_setups(closes, highs, lows, opens_)
        # Reject candidates where NO setup scored — they're just noise
        if setup_result["best_score"] < 15:
            continue

        # Enrichment for backwards compatibility + score composition
        ch20 = _channel_proximity(closes, highs, lows)
        rsi_slope_val = _rsi_slope(closes)
        volume_ratio = (snap.get("volume") or 0) / max(snap.get("avg_volume_20d") or 1, 1)
        pullback_bars = _bars_since_20d_high(highs)
        bull_pattern = _detect_bullish_reversal_pattern(opens_, closes, highs, lows)

        passed.append({
            **snap,
            "setup_type":            setup_result["best_setup"],
            "setup_score":           setup_result["best_score"],
            "setup_scores":          setup_result["scores"],
            "channel_slope":         ch20["slope"],
            "channel_proximity_pct": ch20["proximity_pct"],
            "rsi_slope":             rsi_slope_val,
            "volume_ratio":          volume_ratio,
            "rs_20d":                rs_20d,
            "pullback_bars":         pullback_bars,
            "bull_pattern":          bull_pattern,
        })
    passed.sort(key=lambda x: x.get("setup_score", 0), reverse=True)
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

    # 3. Stage 1: batch snapshot + trend+pullback filter → top 20
    raw_snapshots = _batch_eod_snapshots(SP500_UNIVERSE)
    stage1 = stage1_filter(raw_snapshots, macro_snaps=macro_snaps)

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
            "setup_type":   breakdown["setup_type"],
            "setup":        breakdown["setup_score"],
            "setup_why":    breakdown["setup_why"],
            "setup_scores": breakdown["setup_scores"],
            "macro":        breakdown["macro_pts"],    "macro_why":    breakdown["macro_why"],
            "volume":       breakdown["volume_pts"],   "volume_why":   breakdown["volume_why"],
            "vol_rank":     breakdown["vol_rank_pts"], "vol_rank_why": breakdown["vol_rank_why"],
            "rs":           breakdown["rs_pts"],       "rs_why":       breakdown["rs_why"],
            "options":      breakdown["options_pts"],  "options_why":  breakdown["options_why"],
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
