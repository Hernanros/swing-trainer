import os
import time
import requests

_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 900  # 15 minutes

_FINNHUB_TOKEN = os.getenv("FINNHUB_TOKEN", "")

_YF_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
}


def _fetch_finnhub(symbol: str) -> dict:
    url = f"https://finnhub.io/api/v1/quote"
    r = requests.get(url, params={"symbol": symbol, "token": _FINNHUB_TOKEN}, timeout=10)
    r.raise_for_status()
    d = r.json()
    # d: {c: current, d: change, dp: pct_change, h: high, l: low, o: open, pc: prev_close}
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


def _fetch_yahoo(symbol: str) -> dict:
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
    resp = requests.get(
        url,
        headers=_YF_HEADERS,
        params={"interval": "1d", "range": "1d"},
        timeout=10,
    )
    resp.raise_for_status()
    chart = resp.json().get("chart", {})
    results = chart.get("result")
    if not results:
        err = chart.get("error") or {}
        raise ValueError(f"No data for {symbol}: {err.get('description', 'unknown')}")
    meta = results[0]["meta"]
    price = meta.get("regularMarketPrice")
    if price is None:
        raise ValueError(f"No price returned for {symbol}")
    prev = meta.get("previousClose") or meta.get("chartPreviousClose") or price
    change_pct = round((price - prev) / prev * 100, 2) if prev else 0.0
    return {
        "symbol":     symbol,
        "price":      round(price, 2),
        "prev_close": round(float(prev), 2),
        "change_pct": change_pct,
        "day_high":   round(meta.get("regularMarketDayHigh") or price, 2),
        "day_low":    round(meta.get("regularMarketDayLow") or price, 2),
        "volume":     meta.get("regularMarketVolume"),
        "avg_volume": meta.get("regularMarketVolume"),
    }


def get_candles(symbol: str, range_days: int = 60) -> list[dict]:
    import time as _time
    now = int(_time.time())
    frm = now - range_days * 86400

    if _FINNHUB_TOKEN:
        try:
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
            pass  # fall through to Yahoo Finance

    # Fallback: Yahoo Finance v8 (may be blocked on cloud IPs)
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
    resp = requests.get(url, headers=_YF_HEADERS, params={"interval": "1d", "range": f"{range_days}d"}, timeout=10)
    resp.raise_for_status()
    chart = resp.json().get("chart", {})
    results = chart.get("result")
    if not results:
        raise ValueError(f"No candle data for {symbol}")
    meta = results[0]["meta"]
    timestamps = results[0].get("timestamp", [])
    indicators = results[0].get("indicators", {}).get("quote", [{}])[0]
    price = meta.get("regularMarketPrice", 0)
    opens  = indicators.get("open",  [price] * len(timestamps))
    highs  = indicators.get("high",  [price] * len(timestamps))
    lows   = indicators.get("low",   [price] * len(timestamps))
    closes = indicators.get("close", [price] * len(timestamps))
    volumes= indicators.get("volume",[0]     * len(timestamps))
    candles = []
    for t, o, h, l, c, v in zip(timestamps, opens, highs, lows, closes, volumes):
        if None not in (o, h, l, c):
            candles.append({"time": t, "open": round(o,2), "high": round(h,2),
                             "low": round(l,2), "close": round(c,2), "volume": v or 0})
    return candles


def get_quote(symbol: str) -> dict:
    symbol = symbol.upper()
    now = time.time()
    if symbol in _cache:
        ts, data = _cache[symbol]
        if now - ts < _CACHE_TTL:
            return data

    if _FINNHUB_TOKEN:
        data = _fetch_finnhub(symbol)
    else:
        data = _fetch_yahoo(symbol)

    _cache[symbol] = (now, data)
    return data
