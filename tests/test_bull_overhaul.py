import pytest
from unittest.mock import patch, MagicMock


# ── Task 1: data.py ────────────────────────────────────────────────────────────

def test_options_provider_interface():
    from backend.services.data import YFinanceOptionsProvider
    provider = YFinanceOptionsProvider()
    assert hasattr(provider, "get_nearest_weekly_expiry")
    assert hasattr(provider, "get_chain")
    assert callable(provider.get_nearest_weekly_expiry)
    assert callable(provider.get_chain)


def test_get_options_provider_returns_yfinance_by_default(monkeypatch):
    monkeypatch.delenv("TRADIER_API_KEY", raising=False)
    from backend.services import data as data_svc
    import importlib
    importlib.reload(data_svc)
    provider = data_svc.get_options_provider()
    assert provider.__class__.__name__ == "YFinanceOptionsProvider"


# ── Task 2: get_nearest_weekly_expiry ──────────────────────────────────────────

def test_get_nearest_weekly_expiry_returns_none_for_no_expirations():
    from backend.services.data import YFinanceOptionsProvider
    provider = YFinanceOptionsProvider()
    mock_ticker = MagicMock()
    mock_ticker.options = []
    with patch("yfinance.Ticker", return_value=mock_ticker):
        result = provider.get_nearest_weekly_expiry("FAKE")
    assert result is None


def test_get_nearest_weekly_expiry_returns_date_in_5_14_dte_window():
    from backend.services.data import YFinanceOptionsProvider
    from datetime import date, timedelta
    provider = YFinanceOptionsProvider()
    today = date.today()
    too_close = (today + timedelta(days=3)).isoformat()    # 3 DTE — too soon
    valid = (today + timedelta(days=7)).isoformat()         # 7 DTE — valid
    too_far = (today + timedelta(days=20)).isoformat()     # 20 DTE — too far
    mock_ticker = MagicMock()
    mock_ticker.options = [too_close, valid, too_far]
    with patch("yfinance.Ticker", return_value=mock_ticker):
        result = provider.get_nearest_weekly_expiry("AAPL")
    assert result == valid


def test_get_nearest_weekly_expiry_skips_too_close_expiry():
    from backend.services.data import YFinanceOptionsProvider
    from datetime import date, timedelta
    provider = YFinanceOptionsProvider()
    today = date.today()
    too_close = (today + timedelta(days=2)).isoformat()
    mock_ticker = MagicMock()
    mock_ticker.options = [too_close]
    with patch("yfinance.Ticker", return_value=mock_ticker):
        result = provider.get_nearest_weekly_expiry("AAPL")
    assert result is None


# ── Task 3: get_chain ──────────────────────────────────────────────────────────

def test_get_chain_returns_empty_dict_on_exception():
    from backend.services.data import YFinanceOptionsProvider
    provider = YFinanceOptionsProvider()
    mock_ticker = MagicMock()
    mock_ticker.option_chain.side_effect = Exception("network error")
    with patch("yfinance.Ticker", return_value=mock_ticker):
        result = provider.get_chain("FAKE", "2026-07-11")
    assert result == {"strikes": [], "puts": []}


def test_get_chain_returns_atm_put_data():
    import pandas as pd
    from backend.services.data import YFinanceOptionsProvider
    provider = YFinanceOptionsProvider()
    puts_df = pd.DataFrame([
        {"strike": 180.0, "bid": 1.20, "ask": 1.40, "openInterest": 500, "impliedVolatility": 0.28},
        {"strike": 185.0, "bid": 0.85, "ask": 1.00, "openInterest": 800, "impliedVolatility": 0.32},
        {"strike": 190.0, "bid": 0.40, "ask": 0.55, "openInterest": 300, "impliedVolatility": 0.35},
    ])
    mock_chain = MagicMock()
    mock_chain.puts = puts_df
    hist_df = pd.DataFrame({"Close": [184.0, 185.5]})
    mock_ticker = MagicMock()
    mock_ticker.option_chain.return_value = mock_chain
    mock_ticker.history.return_value = hist_df
    with patch("yfinance.Ticker", return_value=mock_ticker):
        result = provider.get_chain("AAPL", "2026-07-11")
    assert len(result["puts"]) == 3
    atm = next(p for p in result["puts"] if p["strike"] == 185.0)
    assert atm["bid"] == 0.85
    assert atm["oi"] == 800
    assert atm["iv"] > 0


def test_get_chain_estimates_iv_when_zero():
    import pandas as pd
    from backend.services.data import YFinanceOptionsProvider
    from datetime import date, timedelta
    provider = YFinanceOptionsProvider()
    expiry = (date.today() + timedelta(days=7)).isoformat()
    puts_df = pd.DataFrame([
        {"strike": 100.0, "bid": 1.50, "ask": 1.70, "openInterest": 400, "impliedVolatility": 0.0},
    ])
    mock_chain = MagicMock()
    mock_chain.puts = puts_df
    hist_df = pd.DataFrame({"Close": [99.0, 100.0]})
    mock_ticker = MagicMock()
    mock_ticker.option_chain.return_value = mock_chain
    mock_ticker.history.return_value = hist_df
    with patch("yfinance.Ticker", return_value=mock_ticker):
        result = provider.get_chain("TEST", expiry)
    atm = result["puts"][0]
    assert atm["iv"] > 0, "Should estimate IV from bid/ask mid via B-S approximation"


# ── Task 4: _channel_proximity, _rsi_slope ─────────────────────────────────────

def test_channel_proximity_passes_near_lower_band():
    from backend.services.bull import _channel_proximity
    highs = [100 + i * 0.5 for i in range(20)]
    lows  = [95  + i * 0.5 for i in range(20)]
    closes = lows[:]
    closes[-1] = lows[-1] + 0.5
    result = _channel_proximity(closes, highs, lows)
    assert result["passes"] is True
    assert result["slope"] > 0
    assert result["proximity_pct"] < 0.25


def test_channel_proximity_fails_near_upper_band():
    from backend.services.bull import _channel_proximity
    highs = [100 + i * 0.5 for i in range(20)]
    lows  = [90  + i * 0.5 for i in range(20)]
    closes = highs[:]
    result = _channel_proximity(closes, highs, lows)
    assert result["passes"] is False
    assert result["proximity_pct"] > 0.25


def test_channel_proximity_fails_downward_channel():
    from backend.services.bull import _channel_proximity
    highs = [100 - i * 0.5 for i in range(20)]
    lows  = [90  - i * 0.5 for i in range(20)]
    closes = [95  - i * 0.5 for i in range(20)]
    result = _channel_proximity(closes, highs, lows)
    assert result["passes"] is False
    assert result["slope"] < 0


def test_rsi_slope_positive_for_rising_prices():
    from backend.services.bull import _rsi_slope
    # Small losses early, then strong gains late → recent 14-bar window has
    # more gains than the window 2 bars earlier → RSI increases → slope > 0.
    closes = [100 - i * 0.1 for i in range(15)] + [98.5 + i * 1.0 for i in range(10)]
    slope = _rsi_slope(closes)
    assert slope > 0


def test_rsi_slope_negative_for_falling_prices():
    from backend.services.bull import _rsi_slope
    # Small gains early, then strong losses late → recent 14-bar window has
    # more losses than the window 2 bars earlier → RSI decreases → slope < 0.
    closes = [100 + i * 0.1 for i in range(15)] + [101.4 - i * 1.0 for i in range(10)]
    slope = _rsi_slope(closes)
    assert slope < 0


def test_rsi_slope_returns_zero_when_insufficient_data():
    from backend.services.bull import _rsi_slope
    closes = [100.0] * 10
    slope = _rsi_slope(closes)
    assert slope == 0.0


# ── Task 5: deterministic_score + new stage1_filter ────────────────────────────

def test_deterministic_score_both_bullish_complete_full_score():
    from backend.services.bull import deterministic_score
    candidate = {
        "channel_proximity_pct": 0.0,   # at lower band = 25 pts
        "rsi_slope": 3.0,               # max slope = 20 pts
        "volume_ratio": 1.5,            # >=1.2x = 15 pts
        "data_quality": "complete",
        "atm_oi": 600,                  # >=500 + bid>=0.50 = 20 pts
        "atm_bid": 0.60,
    }
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "bullish"}}  # 20 pts
    score = deterministic_score(candidate, macro)
    assert score == 100


def test_deterministic_score_partial_data_quality_gets_zero_options_pts():
    from backend.services.bull import deterministic_score
    candidate = {
        "channel_proximity_pct": 0.0,
        "rsi_slope": 3.0,
        "volume_ratio": 1.5,
        "data_quality": "partial",   # 0 options pts
        "atm_oi": 600,
        "atm_bid": 0.60,
    }
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "bullish"}}
    score = deterministic_score(candidate, macro)
    assert score == 80   # 25 + 20 + 15 + 20 + 0


def test_deterministic_score_one_bullish_gives_10_macro_pts():
    from backend.services.bull import deterministic_score
    candidate = {
        "channel_proximity_pct": 0.0,
        "rsi_slope": 0.0,
        "volume_ratio": 0.5,
        "data_quality": "price_only",
    }
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "neutral"}}
    score = deterministic_score(candidate, macro)
    assert score == 35   # 25 + 0 + 0 + 10 + 0


def test_stage1_filter_returns_candidates_sorted_by_proximity():
    from backend.services import bull as bull_svc

    def _snap(sym, slope, prox_pct, rsi_direction="rising"):
        closes = [100 + i * (0.5 if slope > 0 else -0.5) for i in range(25)]
        lows   = [c - 5 for c in closes[-20:]]
        highs  = [c + 5 for c in closes[-20:]]
        if prox_pct > 0.25:
            closes[-1] = lows[-1] + (highs[-1] - lows[-1]) * prox_pct
        return {
            "symbol": sym,
            "close": closes[-1],
            "sma50": closes[-1] * 0.95,
            "rsi14": 52.0,
            "volume": 2_000_000.0,
            "avg_volume_20d": 1_500_000,
            "closes": closes,
            "highs": highs,
            "lows": lows,
        }

    snapshots = {
        "LOW_PROX": _snap("LOW_PROX", slope=0.5, prox_pct=0.05),
        "MID_PROX": _snap("MID_PROX", slope=0.5, prox_pct=0.20),
        "CHEAP": {
            "symbol": "CHEAP", "close": 8.0, "avg_volume_20d": 2_000_000,
            "closes": [8.0] * 25, "highs": [9.0] * 20, "lows": [7.0] * 20,
        },
    }
    original_cp = bull_svc._channel_proximity
    def mock_cp(closes, highs, lows):
        c = closes[-1]
        if c > 100:
            prox = 0.05 if c > 112 else 0.20
            return {"slope": 0.5, "proximity_pct": prox, "passes": True}
        return {"slope": 0.5, "proximity_pct": 0.5, "passes": False}
    bull_svc._channel_proximity = mock_cp

    original_rs = bull_svc._rsi_slope
    bull_svc._rsi_slope = lambda c: 1.0

    try:
        result = bull_svc.stage1_filter(snapshots)
    finally:
        bull_svc._channel_proximity = original_cp
        bull_svc._rsi_slope = original_rs

    symbols = [r["symbol"] for r in result]
    assert "CHEAP" not in symbols          # price < 15 floor
    assert "channel_proximity_pct" in result[0]


def test_stage1_filter_excludes_failed_channel():
    from backend.services import bull as bull_svc

    snap = {
        "symbol": "FLAT", "close": 100.0, "avg_volume_20d": 1_500_000,
        "volume": 1_500_000,
        "closes": [100.0] * 25,
        "highs": [105.0] * 20,
        "lows": [95.0] * 20,
    }
    original_cp = bull_svc._channel_proximity
    bull_svc._channel_proximity = lambda c, h, l: {"slope": -0.1, "proximity_pct": 0.1, "passes": False}
    original_rs = bull_svc._rsi_slope
    bull_svc._rsi_slope = lambda c: 1.0
    try:
        result = bull_svc.stage1_filter({"FLAT": snap})
    finally:
        bull_svc._channel_proximity = original_cp
        bull_svc._rsi_slope = original_rs
    assert result == []
