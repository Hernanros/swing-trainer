import os
import time
import requests
from datetime import datetime, timezone

_cache: dict[str, tuple[float, dict]] = {}
_candle_cache: dict[str, tuple[float, list]] = {}
_CACHE_TTL = 900  # 15 minutes

_FINNHUB_TOKEN = os.getenv("FINNHUB_TOKEN", "")
_TWELVEDATA_KEY = os.getenv("TWELVEDATA_API_KEY", "")


def _fetch_twelvedata_quote(symbol: str) -> dict:
    url = "https://api.twelvedata.com/quote"
    r = requests.get(url, params={"symbol": symbol, "apikey": _TWELVEDATA_KEY}, timeout=10)
    r.raise_for_status()
    d = r.json()
    if d.get("status") == "error":
        raise ValueError(f"Twelve Data quote error for {symbol}: {d.get('message', 'unknown')}")
    # free plan returns 'close' as current price, paid returns 'price'
    price = float(d.get("price") or d.get("close") or 0)
    if not price:
        raise ValueError(f"No price in Twelve Data response for {symbol}")
    prev = float(d.get("previous_close") or price)
    change_pct = round((price - prev) / prev * 100, 2) if prev else 0.0
    return {
        "symbol":     symbol,
        "price":      round(price, 2),
        "prev_close": round(prev, 2),
        "change_pct": change_pct,
        "day_high":   round(float(d.get("high") or price), 2),
        "day_low":    round(float(d.get("low") or price), 2),
        "volume":     int(d["volume"]) if d.get("volume") else None,
        "avg_volume": None,
    }


def _fetch_twelvedata_candles(symbol: str, range_days: int) -> list[dict]:
    url = "https://api.twelvedata.com/time_series"
    r = requests.get(url, params={
        "symbol":     symbol,
        "interval":   "1day",
        "outputsize": range_days,
        "apikey":     _TWELVEDATA_KEY,
    }, timeout=15)
    r.raise_for_status()
    d = r.json()
    if d.get("status") == "error" or "values" not in d:
        raise ValueError(f"Twelve Data candles error for {symbol}: {d.get('message', 'unknown')}")
    candles = []
    for row in d["values"]:
        ts = int(datetime.strptime(row["datetime"], "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
        candles.append({
            "time":   ts,
            "open":   round(float(row["open"]),   2),
            "high":   round(float(row["high"]),   2),
            "low":    round(float(row["low"]),    2),
            "close":  round(float(row["close"]),  2),
            "volume": int(float(row.get("volume") or 0)),
        })
    return sorted(candles, key=lambda c: c["time"])


def _fetch_finnhub(symbol: str) -> dict:
    url = "https://finnhub.io/api/v1/quote"
    r = requests.get(url, params={"symbol": symbol, "token": _FINNHUB_TOKEN}, timeout=10)
    r.raise_for_status()
    d = r.json()
    price = d.get("c")
    if not price:
        raise ValueError(f"No data for {symbol}")
    prev = d.get("pc") or price
    return {
        "symbol":     symbol,
        "price":      round(float(price), 2),
        "prev_close": round(float(prev), 2),
        "change_pct": round(float(d.get("dp") or 0), 2),
        "day_high":   round(float(d.get("h") or price), 2),
        "day_low":    round(float(d.get("l") or price), 2),
        "volume":     None,
        "avg_volume": None,
    }


def get_candles(symbol: str, range_days: int = 60) -> list[dict]:
    symbol = symbol.upper()
    cache_key = f"{symbol}:{range_days}"
    now = time.time()
    if cache_key in _candle_cache:
        ts, data = _candle_cache[cache_key]
        if now - ts < _CACHE_TTL:
            return data

    candles = _fetch_candles(symbol, range_days)
    _candle_cache[cache_key] = (now, candles)
    return candles


def _fetch_candles(symbol: str, range_days: int) -> list[dict]:
    # 1. Twelve Data — primary, works from cloud IPs
    if _TWELVEDATA_KEY:
        try:
            return _fetch_twelvedata_candles(symbol, range_days)
        except Exception:
            pass

    # 2. Finnhub (free tier usually blocks candles, but try)
    if _FINNHUB_TOKEN:
        try:
            now = int(time.time())
            frm = now - range_days * 86400
            url = "https://finnhub.io/api/v1/stock/candle"
            r = requests.get(url, params={
                "symbol": symbol, "resolution": "D",
                "from": frm, "to": now, "token": _FINNHUB_TOKEN,
            }, timeout=10)
            r.raise_for_status()
            d = r.json()
            if d.get("s") == "ok" and d.get("t"):
                return [
                    {"time": t, "open": o, "high": h, "low": l, "close": c, "volume": v}
                    for t, o, h, l, c, v in zip(d["t"], d["o"], d["h"], d["l"], d["c"], d["v"])
                ]
        except Exception:
            pass

    raise ValueError(f"No candle data available for {symbol}")


def get_quote(symbol: str) -> dict:
    symbol = symbol.upper()
    now = time.time()
    if symbol in _cache:
        ts, data = _cache[symbol]
        if now - ts < _CACHE_TTL:
            return data

    data = _fetch_quote(symbol)
    _cache[symbol] = (now, data)
    return data


def _fetch_quote(symbol: str) -> dict:
    # 1. Finnhub — proven reliable for quotes
    if _FINNHUB_TOKEN:
        try:
            return _fetch_finnhub(symbol)
        except Exception:
            pass

    # 2. Twelve Data — fallback
    if _TWELVEDATA_KEY:
        try:
            return _fetch_twelvedata_quote(symbol)
        except Exception:
            pass

    raise ValueError(f"No quote data available for {symbol}")
