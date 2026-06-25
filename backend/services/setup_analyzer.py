"""Compute objective technical context at trade entry so the debrief
prompt can evaluate playbook rules against real numbers instead of
trusting Claude's guesswork from rule text alone.

Public surface:
    compute_setup_context(symbol, trade_date) -> Optional[dict]
    format_setup_context(ctx) -> str
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from backend.services.market import get_candles, _compute_sma, _compute_rsi

logger = logging.getLogger(__name__)


def compute_setup_context(symbol: str, trade_date: str) -> Optional[dict]:
    if not symbol or not trade_date:
        return None
    try:
        candles = get_candles(symbol.upper(), range_days=80, date=trade_date)
    except Exception:
        logger.exception("Setup context: candle fetch failed for %s on %s", symbol, trade_date)
        return None
    if not candles:
        return None
    try:
        cutoff = int(datetime.strptime(trade_date, "%Y-%m-%d").timestamp()) + 86400  # +1d for tz slack
    except ValueError:
        return None
    entry_candles = [c for c in candles if c.get("time", 0) <= cutoff]
    if len(entry_candles) < 20:
        if len(candles) < 20:
            return None
        entry_candles = candles
    closes  = [c["close"]  for c in entry_candles]
    highs   = [c["high"]   for c in entry_candles]
    lows    = [c["low"]    for c in entry_candles]
    volumes = [c.get("volume") or 0 for c in entry_candles]

    # Lazy import to avoid a startup-time cycle with bull.py
    from backend.services.bull import _channel_proximity, _channel_context_60d

    close = closes[-1]
    sma50 = _compute_sma(closes, 50)
    sma20 = _compute_sma(closes, 20)
    rsi14 = _compute_rsi(closes, 14)
    ch20  = _channel_proximity(closes, highs, lows)
    ch60  = _channel_context_60d(closes, highs, lows)
    avg_vol_20 = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else None
    vol_ratio = (volumes[-1] / avg_vol_20) if avg_vol_20 and avg_vol_20 > 0 else None

    return {
        "symbol": symbol.upper(),
        "trade_date": trade_date,
        "close": float(close),
        "sma50": float(sma50) if sma50 else None,
        "sma20": float(sma20) if sma20 else None,
        "rsi14": float(rsi14) if rsi14 is not None else None,
        "channel_20d": ch20,
        "channel_60d": ch60,
        "volume": int(volumes[-1]) if volumes else 0,
        "avg_volume_20d": int(avg_vol_20) if avg_vol_20 else None,
        "volume_ratio": round(vol_ratio, 2) if vol_ratio is not None else None,
        "bars_used": len(entry_candles),
    }


def format_setup_context(ctx: dict) -> str:
    lines = [f"Technical context at entry ({ctx['symbol']} on {ctx['trade_date']}, computed from {ctx['bars_used']} prior daily bars):"]
    close = ctx["close"]
    lines.append(f"- Close: ${close:.2f}")

    sma50 = ctx.get("sma50")
    if sma50:
        diff_pct = (close - sma50) / sma50 * 100
        rel = "above" if close > sma50 else "below"
        lines.append(f"- SMA(50): ${sma50:.2f} (close is {rel} SMA50 by {abs(diff_pct):.1f}%)")
    sma20 = ctx.get("sma20")
    if sma20:
        diff_pct = (close - sma20) / sma20 * 100
        rel = "above" if close > sma20 else "below"
        lines.append(f"- SMA(20): ${sma20:.2f} (close is {rel} by {abs(diff_pct):.1f}%)")

    rsi = ctx.get("rsi14")
    if rsi is not None:
        zone = "overbought" if rsi > 70 else "oversold" if rsi < 30 else "neutral"
        lines.append(f"- RSI(14): {rsi:.1f} ({zone})")

    ch20 = ctx.get("channel_20d") or {}
    if ch20:
        pct = ch20.get("proximity_pct", 0.5) * 100
        slope = ch20.get("slope", 0)
        direction = "rising" if slope > 0 else "falling" if slope < 0 else "flat"
        lines.append(
            f"- 20d channel: {direction} (slope {slope:+.3f}); close at {pct:.0f}% from lower band "
            f"(0% = at support, 100% = at resistance)"
        )
    ch60 = ctx.get("channel_60d") or {}
    if ch60:
        pct = ch60.get("proximity_pct", 0.5) * 100
        slope = ch60.get("slope", 0)
        direction = "rising" if slope > 0 else "falling" if slope < 0 else "flat"
        lines.append(f"- 60d channel: {direction} (slope {slope:+.3f}); close at {pct:.0f}% from lower band")

    vr = ctx.get("volume_ratio")
    if vr is not None and ctx.get("avg_volume_20d"):
        lines.append(f"- Volume: {ctx['volume']:,} vs 20d avg {ctx['avg_volume_20d']:,} (ratio {vr:.2f}x)")

    return "\n".join(lines)
