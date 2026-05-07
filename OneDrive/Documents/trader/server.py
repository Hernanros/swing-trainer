"""
TradeLog backend — port 7432
Serves OHLCV + indicator data from yfinance.

Endpoints:
  GET /health
  GET /chart?symbol=AAPL&tf=1D&indicators=ema20,rsi,macd
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
import pandas as pd
import numpy as np
import traceback

app = Flask(__name__)
CORS(app)

# ── Timeframe mapping ──────────────────────────────────────────────────────────
TF_MAP = {
    "1W":  ("1wk",  None),
    "1D":  ("1d",   None),
    "4H":  ("1h",   "4h"),   # fetch 1h, resample to 4h
    "2H":  ("1h",   "2h"),   # fetch 1h, resample to 2h
    "1H":  ("60m",  None),
    "30M": ("30m",  None),
    "15M": ("15m",  None),
    "5M":  ("5m",   None),
}

# How many bars to fetch per timeframe (yfinance period)
TF_PERIOD = {
    "1wk": "2y",
    "1d":  "1y",
    "60m": "60d",
    "30m": "60d",
    "15m": "30d",
    "5m":  "5d",
}


def resample_ohlcv(df, rule):
    return df.resample(rule).agg({
        "Open":   "first",
        "High":   "max",
        "Low":    "min",
        "Close":  "last",
        "Volume": "sum",
    }).dropna()


def compute_rsi(close, period=14):
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - (100 / (1 + rs))).round(2)


def compute_macd(close, fast=12, slow=26, signal=9):
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd = ema_fast - ema_slow
    sig  = macd.ewm(span=signal, adjust=False).mean()
    hist = macd - sig
    return macd.round(4), sig.round(4), hist.round(4)


def compute_bb(close, period=20, std=2):
    mid  = close.rolling(period).mean()
    band = close.rolling(period).std()
    return (mid + std * band).round(4), mid.round(4), (mid - std * band).round(4)


def compute_atr(high, low, close, period=14):
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low  - close.shift()).abs(),
    ], axis=1).max(axis=1)
    return tr.rolling(period).mean().round(4)


def compute_stoch(high, low, close, k=14, d=3):
    low_k  = low.rolling(k).min()
    high_k = high.rolling(k).max()
    pct_k  = 100 * (close - low_k) / (high_k - low_k).replace(0, np.nan)
    pct_d  = pct_k.rolling(d).mean()
    return pct_k.round(2), pct_d.round(2)


def compute_vwap(df):
    tp = (df["High"] + df["Low"] + df["Close"]) / 3
    vwap = (tp * df["Volume"]).cumsum() / df["Volume"].cumsum()
    return vwap.round(4)


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/chart")
def chart():
    symbol     = request.args.get("symbol", "").upper()
    tf         = request.args.get("tf", "1D")
    indicators = [i.strip() for i in request.args.get("indicators", "").split(",") if i.strip()]

    if not symbol:
        return jsonify({"error": "symbol required"}), 400
    if tf not in TF_MAP:
        return jsonify({"error": f"unknown timeframe {tf}"}), 400

    yf_interval, resample_rule = TF_MAP[tf]
    period = TF_PERIOD.get(yf_interval, "1y")

    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=yf_interval, auto_adjust=True)

        if df.empty:
            return jsonify({"error": f"no data for {symbol}"}), 404

        if resample_rule:
            df = resample_ohlcv(df, resample_rule)

        df = df.dropna(subset=["Open", "High", "Low", "Close"])

        # Build candles list
        candles = []
        for ts, row in df.iterrows():
            candles.append({
                "t": int(ts.timestamp() * 1000),
                "o": round(float(row["Open"]),  4),
                "h": round(float(row["High"]),  4),
                "l": round(float(row["Low"]),   4),
                "c": round(float(row["Close"]), 4),
                "v": int(row["Volume"]),
            })

        result = {"symbol": symbol, "tf": tf, "candles": candles, "indicators": {}}

        close  = df["Close"]
        high   = df["High"]
        low    = df["Low"]

        def to_list(s):
            return [None if pd.isna(v) else round(float(v), 4) for v in s]

        for ind in indicators:
            if ind == "ema20":
                result["indicators"]["ema20"] = to_list(close.ewm(span=20, adjust=False).mean())
            elif ind == "ema50":
                result["indicators"]["ema50"] = to_list(close.ewm(span=50, adjust=False).mean())
            elif ind == "sma200":
                result["indicators"]["sma200"] = to_list(close.rolling(200).mean())
            elif ind == "rsi":
                result["indicators"]["rsi"] = to_list(compute_rsi(close))
            elif ind == "macd":
                m, s, h = compute_macd(close)
                result["indicators"]["macd"]        = to_list(m)
                result["indicators"]["macd_signal"] = to_list(s)
                result["indicators"]["macd_hist"]   = to_list(h)
            elif ind == "bb":
                upper, mid, lower = compute_bb(close)
                result["indicators"]["bb_upper"] = to_list(upper)
                result["indicators"]["bb_mid"]   = to_list(mid)
                result["indicators"]["bb_lower"] = to_list(lower)
            elif ind == "vwap":
                result["indicators"]["vwap"] = to_list(compute_vwap(df))
            elif ind == "atr":
                result["indicators"]["atr"] = to_list(compute_atr(high, low, close))
            elif ind == "stoch":
                k, d = compute_stoch(high, low, close)
                result["indicators"]["stoch_k"] = to_list(k)
                result["indicators"]["stoch_d"] = to_list(d)
            elif ind == "volume_ma":
                result["indicators"]["volume_ma"] = to_list(df["Volume"].rolling(20).mean())

        return jsonify(result)

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "internal error"}), 500


if __name__ == "__main__":
    print("TradeLog backend running on http://localhost:7432")
    app.run(host="0.0.0.0", port=7432, debug=True)
