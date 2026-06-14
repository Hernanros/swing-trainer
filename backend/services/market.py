import os
import time
import requests
from datetime import date, datetime, timezone, timedelta
from typing import Optional

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


def _fetch_twelvedata_candles(symbol: str, range_days: int, end_date: Optional[str] = None) -> list[dict]:
    url = "https://api.twelvedata.com/time_series"
    params = {
        "symbol":     symbol,
        "interval":   "1day",
        "outputsize": range_days,
        "apikey":     _TWELVEDATA_KEY,
    }
    if end_date:
        params["end_date"] = end_date
    r = requests.get(url, params=params, timeout=15)
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


def get_candles(symbol: str, range_days: int = 60, date: Optional[str] = None) -> list[dict]:
    symbol = symbol.upper()
    if date:
        # historical requests bypass the in-memory cache — router handles DB caching
        return _fetch_candles(symbol, range_days, date=date)

    cache_key = f"{symbol}:{range_days}"
    now = time.time()
    if cache_key in _candle_cache:
        ts, data = _candle_cache[cache_key]
        if now - ts < _CACHE_TTL:
            return data

    candles = _fetch_candles(symbol, range_days)
    _candle_cache[cache_key] = (now, candles)
    return candles


def _fetch_candles(symbol: str, range_days: int, date: Optional[str] = None) -> list[dict]:
    end_date = None
    to_ts = None
    if date:
        trade_dt = datetime.strptime(date, "%Y-%m-%d")
        end_date = (trade_dt + timedelta(days=10)).strftime("%Y-%m-%d")
        to_ts = int((trade_dt + timedelta(days=10)).timestamp())

    # 1. Twelve Data — primary, works from cloud IPs
    if _TWELVEDATA_KEY:
        try:
            return _fetch_twelvedata_candles(symbol, range_days, end_date=end_date)
        except Exception:
            pass

    # 2. Finnhub (free tier usually blocks candles, but try)
    if _FINNHUB_TOKEN:
        try:
            finnhub_to = to_ts if to_ts is not None else int(time.time())
            frm = finnhub_to - range_days * 86400
            url = "https://finnhub.io/api/v1/stock/candle"
            r = requests.get(url, params={
                "symbol": symbol, "resolution": "D",
                "from": frm, "to": finnhub_to, "token": _FINNHUB_TOKEN,
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


def get_next_earnings(symbol: str) -> dict:
    if not _FINNHUB_TOKEN:
        raise ValueError("FINNHUB_TOKEN not configured")
    symbol = symbol.upper()
    today = date.today()
    to_date = today + timedelta(days=365)
    url = "https://finnhub.io/api/v1/calendar/earnings"
    r = requests.get(url, params={
        "symbol": symbol,
        "from": today.isoformat(),
        "to": to_date.isoformat(),
        "token": _FINNHUB_TOKEN,
    }, timeout=10)
    r.raise_for_status()
    data = r.json()
    upcoming = [
        e for e in data.get("earningsCalendar", [])
        if isinstance(e.get("date"), str) and e["date"] >= today.isoformat()
    ]
    if not upcoming:
        raise ValueError(f"No upcoming earnings found for {symbol}")
    upcoming.sort(key=lambda e: e["date"])
    return {"date": upcoming[0]["date"]}


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


# ── Bull Assistant market extensions ──────────────────────────────────────────

SECTOR_ETFS = ["XLK", "XLF", "XLE", "XLV", "XLY", "XLI", "XLB", "XLRE", "XLU", "XLC", "XLP"]


def _compute_sma(closes: list, period: int) -> Optional[float]:
    if len(closes) < period:
        return None
    return round(sum(closes[-period:]) / period, 2)


def _compute_rsi(closes: list, period: int = 14) -> Optional[float]:
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [d for d in deltas[-period:] if d > 0]
    losses = [-d for d in deltas[-period:] if d < 0]
    avg_gain = sum(gains) / period if gains else 0
    avg_loss = sum(losses) / period if losses else 0
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def get_eod_snapshot(symbol: str) -> Optional[dict]:
    """EOD technical snapshot: close, sma50, rsi14, volume, avg_volume_20d. Returns None on error."""
    try:
        candles = _fetch_candles(symbol.upper(), 60)
        if len(candles) < 21:
            return None
        closes = [c["close"] for c in candles]
        volumes = [c["volume"] for c in candles]
        sma50 = _compute_sma(closes, 50)
        rsi14 = _compute_rsi(closes, 14)
        avg_vol_20d = int(sum(volumes[-20:]) / 20) if len(volumes) >= 20 else None
        return {
            "symbol": symbol.upper(),
            "close": closes[-1],
            "sma50": sma50,
            "rsi14": rsi14,
            "volume": volumes[-1],
            "avg_volume_20d": avg_vol_20d,
        }
    except Exception:
        return None


def get_sector_etfs() -> list:
    """Sector ETF rankings with pct_vs_20d and label (strong/neutral/weak)."""
    results = []
    for sym in SECTOR_ETFS:
        try:
            candles = _fetch_candles(sym, 25)
            if len(candles) < 21:
                continue
            closes = [c["close"] for c in candles]
            avg_20d = sum(closes[-21:-1]) / 20
            latest = closes[-1]
            pct = round((latest - avg_20d) / avg_20d * 100, 2)
            if pct > 0.5:
                label = "strong"
            elif pct < -0.5:
                label = "weak"
            else:
                label = "neutral"
            results.append({"symbol": sym, "pct_vs_20d": pct, "label": label, "close": latest})
        except Exception:
            continue
    return results
