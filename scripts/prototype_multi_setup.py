"""One-off prototype of the multi-setup detector, run against yfinance
directly so we can validate the architecture before touching prod code.

Prints the funnel + top candidates by setup type + score distribution.
"""
from __future__ import annotations
import sys
from typing import Optional
import yfinance as yf

# Import helpers from the existing bull service
from backend.services.bull import (
    SP500_UNIVERSE, _channel_proximity, _channel_context_60d,
    _rsi_slope, _rs_20d, _bars_since_20d_high, _detect_bullish_reversal_pattern,
    _compute_volume_52w,
)
from backend.services.market import _compute_sma, _compute_rsi


def detect_pullback_uptrend(closes, highs, lows) -> int:
    """0–60 pts. Rising 20d channel + close near lower band + 60d agrees + fresh pullback."""
    ch20 = _channel_proximity(closes, highs, lows)
    ch60 = _channel_context_60d(closes, highs, lows)
    if ch20["slope"] <= 0:
        return 0
    # 25 pts scaled by how close to lower band (0% = 25, 50% = 12, >50% = 0)
    prox = ch20["proximity_pct"]
    if prox is None or prox < 0 or prox > 0.5:
        proximity_pts = 0
    else:
        proximity_pts = int(25 * (1 - prox / 0.5))
    slope_pts = 15 if ch20["slope"] > 0 else 0
    ctx60_pts = 10 if (ch60["slope"] > 0 and ch60["proximity_pct"] <= 0.6) else 0
    pullback_bars = _bars_since_20d_high(highs)
    fresh_pts = 10 if pullback_bars <= 3 else (5 if pullback_bars <= 7 else 0)
    return proximity_pts + slope_pts + ctx60_pts + fresh_pts


def detect_base_breakout(closes, highs, lows) -> int:
    """0–60 pts. Tight range (low volatility) with close near top of the range."""
    if len(closes) < 20:
        return 0
    window20 = closes[-20:]
    hi20 = max(highs[-20:])
    lo20 = min(lows[-20:])
    avg = sum(window20) / 20
    if avg <= 0 or lo20 <= 0:
        return 0
    range_pct = (hi20 - lo20) / avg * 100
    # Tighter range = better base
    if range_pct < 8:
        base_pts = 30
    elif range_pct < 12:
        base_pts = 20
    elif range_pct < 18:
        base_pts = 10
    else:
        return 0  # not a base, not a breakout setup
    close = closes[-1]
    # Position in range: 1.0 = at high, 0.0 = at low. Near top = breakout imminent.
    pos = (close - lo20) / (hi20 - lo20) if hi20 > lo20 else 0.5
    top_pts = 15 if pos >= 0.8 else (10 if pos >= 0.6 else 5 if pos >= 0.4 else 0)
    # RSI in neutral zone during base
    rsi = _compute_rsi(closes, 14)
    rsi_pts = 5 if rsi is not None and 40 <= rsi <= 65 else 0
    # Volume drying up in recent 10 vs prior 10 (needs volumes but we skip here)
    return base_pts + top_pts + rsi_pts


def detect_oversold_bounce(closes, opens_) -> int:
    """0–60 pts. RSI reached < 30 recently and is now turning up."""
    if len(closes) < 25:
        return 0
    # Min RSI in last 10 bars (needs full-history RSI at each point — approximate with rolling)
    rsis = []
    for i in range(-10, 0):
        segment = closes[: len(closes) + i + 1] if i < 0 else closes
        r = _compute_rsi(segment, 14)
        if r is not None:
            rsis.append(r)
    if not rsis:
        return 0
    min_rsi = min(rsis)
    cur_rsi = rsis[-1] if rsis else None
    # Deep dip: bigger bonus for lower min
    if min_rsi < 25:
        dip_pts = 25
    elif min_rsi < 30:
        dip_pts = 15
    elif min_rsi < 35:
        dip_pts = 5
    else:
        return 0  # not oversold, wrong setup
    # Turning up: current RSI must be above the minimum by a margin
    turn_pts = 15 if cur_rsi and cur_rsi > min_rsi + 5 else (10 if cur_rsi and cur_rsi > min_rsi + 2 else 0)
    # Green bar today
    green_pts = 10 if len(opens_) >= 1 and closes[-1] > opens_[-1] else 0
    return dip_pts + turn_pts + green_pts


def detect_range_support(closes, highs, lows) -> int:
    """0–60 pts. Wider range-bound stock currently near range low."""
    if len(closes) < 30:
        return 0
    hi30 = max(highs[-30:])
    lo30 = min(lows[-30:])
    if lo30 <= 0:
        return 0
    range_ratio = hi30 / lo30
    if range_ratio > 1.30:
        return 0  # too wide, not range-bound
    close = closes[-1]
    pos = (close - lo30) / (hi30 - lo30) if hi30 > lo30 else 0.5
    # Only fires if close is near range low
    if pos > 0.35:
        return 0
    range_pts = 25 if range_ratio < 1.15 else (18 if range_ratio < 1.20 else 10)
    bottom_pts = 25 if pos < 0.15 else (18 if pos < 0.25 else 10)
    # Bonus if recent lows tested and held (last 5 bars didn't set new low)
    recent_low = min(lows[-5:])
    hold_pts = 10 if recent_low > lo30 * 1.005 else 0
    return range_pts + bottom_pts + hold_pts


def score_candidate(snap, spy_closes) -> dict:
    closes  = snap["closes"]
    highs   = snap["highs"]
    lows    = snap["lows"]
    opens_  = snap.get("opens", [])
    pullback_score = detect_pullback_uptrend(closes, highs, lows)
    base_score     = detect_base_breakout(closes, highs, lows)
    bounce_score   = detect_oversold_bounce(closes, opens_)
    range_score    = detect_range_support(closes, highs, lows)
    setup_scores = {
        "pullback_uptrend": pullback_score,
        "base_breakout":    base_score,
        "oversold_bounce":  bounce_score,
        "range_support":    range_score,
    }
    best_setup = max(setup_scores, key=setup_scores.get)
    setup_score = setup_scores[best_setup]

    # Context bonuses (40 pts total)
    rs = _rs_20d(closes, spy_closes) if spy_closes else 0.0
    rs_pts = 5 if rs >= 5 else 0
    vol_ratio = snap.get("volume", 0) / max(snap.get("avg_volume_20d", 1), 1)
    vol_pts = 10 if vol_ratio >= 1.2 else (7 if vol_ratio >= 0.8 else 0)
    vol_52w = _compute_volume_52w([float(v) for v in snap.get("_all_volumes", [])], snap.get("_all_dates", []))
    vol_rank_pts = 5 if vol_52w.get("vol_52w_pct_rank", 0) >= 95 else (3 if vol_52w.get("vol_52w_pct_rank", 0) >= 80 else 0)

    total = min(100, setup_score + rs_pts + vol_pts + vol_rank_pts + 10)  # +10 placeholder macro/options
    pattern = _detect_bullish_reversal_pattern(opens_, closes, highs, lows)
    return {
        "symbol": snap["symbol"],
        "best_setup": best_setup,
        "setup_score": setup_score,
        "all_setups": setup_scores,
        "total": total,
        "close": closes[-1],
        "rs_20d": round(rs, 1),
        "pattern": pattern,
    }


def main():
    universe = SP500_UNIVERSE
    print(f"Universe size: {len(universe)}")
    print("Fetching yfinance batch (1y, ~30s)...")
    data = yf.download(tickers=["SPY"] + universe, period="1y", interval="1d",
                       group_by="ticker", auto_adjust=True, progress=False, threads=True)
    spy_df = data["SPY"].dropna(subset=["Close"])
    spy_closes = spy_df["Close"].tolist()

    gated = 0
    scored = []
    for sym in universe:
        try:
            df = data[sym].dropna(subset=["Close", "Volume"])
            if len(df) < 60:
                continue
            closes = df["Close"].tolist()
            volumes = df["Volume"].tolist()
            opens_ = df["Open"].tolist()
            highs = df["High"].tolist()
            lows = df["Low"].tolist()
            dates = [str(d.date()) for d in df.index]
            close = float(closes[-1])
            if close <= 15:
                continue
            avg_vol_20 = int(sum(volumes[-20:]) / 20)
            if avg_vol_20 < 500_000:
                continue
            sma50 = sum(closes[-50:]) / 50
            if close < sma50 * 0.98:
                continue
            rs = _rs_20d(closes, spy_closes)
            if rs < -5.0:
                continue
            gated += 1
            snap = {
                "symbol": sym, "close": close, "sma50": sma50,
                "volume": float(volumes[-1]), "avg_volume_20d": avg_vol_20,
                "closes": closes[-65:], "highs": highs[-65:], "lows": lows[-65:],
                "opens": opens_[-65:], "_all_volumes": volumes, "_all_dates": dates,
            }
            scored.append(score_candidate(snap, spy_closes))
        except Exception:
            continue

    print(f"\n== FUNNEL ==")
    print(f"Passed hard gates: {gated}")
    print(f"Scored: {len(scored)}")

    # Distribution by winning setup
    from collections import Counter
    setup_counts = Counter([c["best_setup"] for c in scored])
    print(f"\n== BEST-SETUP DISTRIBUTION ==")
    for setup, n in setup_counts.most_common():
        print(f"  {setup:20} {n:4}")

    print(f"\n== TOP 20 by total score ==")
    scored.sort(key=lambda c: c["total"], reverse=True)
    print(f"  {'symbol':<8} {'total':>6} {'setup':<20} {'setup_pts':>10} {'rs_20d':>8} {'pattern':<20}")
    for c in scored[:20]:
        print(f"  {c['symbol']:<8} {c['total']:>6} {c['best_setup']:<20} {c['setup_score']:>10} {c['rs_20d']:>+8} {str(c['pattern'] or ''):<20}")

    # Score distribution
    high = sum(1 for c in scored if c["total"] >= 70)
    mid  = sum(1 for c in scored if 50 <= c["total"] < 70)
    low  = sum(1 for c in scored if c["total"] < 50)
    print(f"\n== SCORE DISTRIBUTION ==")
    print(f"  >=70: {high}   50-69: {mid}   <50: {low}")


if __name__ == "__main__":
    main()
