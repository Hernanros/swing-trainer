import pytest
import math
from unittest.mock import patch, MagicMock


def test_sp500_universe_has_at_least_400_symbols():
    from backend.services.bull import SP500_UNIVERSE
    assert len(SP500_UNIVERSE) >= 400


def test_stage1_filter_removes_low_price_stocks(monkeypatch):
    from backend.services import bull as bull_svc
    snapshots = {
        "AAPL": {"symbol": "AAPL", "close": 185.0, "sma50": 180.0, "rsi14": 52.0, "volume": 2000000, "avg_volume_20d": 1500000},
        "CHEAP": {"symbol": "CHEAP", "close": 10.0, "sma50": 9.0, "rsi14": 45.0, "volume": 100000, "avg_volume_20d": 80000},
        "LOWVOL": {"symbol": "LOWVOL", "close": 50.0, "sma50": 48.0, "rsi14": 48.0, "volume": 200000, "avg_volume_20d": 150000},
    }
    result = bull_svc.stage1_filter(snapshots)
    symbols = [r["symbol"] for r in result]
    assert "AAPL" in symbols
    assert "CHEAP" not in symbols    # price < 15
    assert "LOWVOL" not in symbols   # avg_volume_20d < 500000


def test_stage1_filter_removes_stocks_below_sma50(monkeypatch):
    from backend.services import bull as bull_svc
    snapshots = {
        "ABOVE": {"symbol": "ABOVE", "close": 100.0, "sma50": 95.0, "rsi14": 52.0, "volume": 1000000, "avg_volume_20d": 900000},
        "BELOW": {"symbol": "BELOW", "close": 90.0, "sma50": 95.0, "rsi14": 45.0, "volume": 1000000, "avg_volume_20d": 900000},
    }
    result = bull_svc.stage1_filter(snapshots)
    symbols = [r["symbol"] for r in result]
    assert "ABOVE" in symbols
    assert "BELOW" not in symbols


# ── Task 3: Stage 2 screener ──────────────────────────────────────────────────

def test_stage2_filter_removes_low_iv_stocks():
    from backend.services import bull as bull_svc
    candidates = [
        {"symbol": "AAPL", "close": 185.0, "rsi14": 52.0},
        {"symbol": "LOWIV", "close": 100.0, "rsi14": 50.0},
    ]
    def mock_snapshot(symbol):
        if symbol == "AAPL":
            return {"iv": 0.34, "ivr": 34.0, "atm_oi": 800, "atm_spread_pct": 0.08, "nearest_expiry": "2026-07-18", "atm_strike": 185.0}
        if symbol == "LOWIV":
            return {"iv": 0.10, "ivr": 10.0, "atm_oi": 200, "atm_spread_pct": 0.20, "nearest_expiry": "2026-07-18", "atm_strike": 100.0}
        return None
    mock_provider = MagicMock()
    mock_provider.get_options_snapshot.side_effect = mock_snapshot
    result = bull_svc.stage2_filter(candidates, mock_provider)
    symbols = [r["symbol"] for r in result]
    assert "AAPL" in symbols
    assert "LOWIV" not in symbols   # ivr < 20


def test_stage2_filter_removes_low_open_interest():
    from backend.services import bull as bull_svc
    candidates = [{"symbol": "LOWOI", "close": 100.0, "rsi14": 50.0}]
    mock_provider = MagicMock()
    mock_provider.get_options_snapshot.return_value = {
        "iv": 0.30, "ivr": 30.0, "atm_oi": 100,   # < 500 threshold
        "atm_spread_pct": 0.08, "nearest_expiry": "2026-07-18", "atm_strike": 100.0
    }
    result = bull_svc.stage2_filter(candidates, mock_provider)
    assert result == []


def test_stage2_filter_removes_wide_spread():
    from backend.services import bull as bull_svc
    candidates = [{"symbol": "WIDESPREAD", "close": 100.0, "rsi14": 50.0}]
    mock_provider = MagicMock()
    mock_provider.get_options_snapshot.return_value = {
        "iv": 0.30, "ivr": 30.0, "atm_oi": 600,
        "atm_spread_pct": 0.20,   # > 0.15 threshold
        "nearest_expiry": "2026-07-18", "atm_strike": 100.0
    }
    result = bull_svc.stage2_filter(candidates, mock_provider)
    assert result == []


# ── Task 4: Claude Haiku batch scoring ───────────────────────────────────────

def test_build_score_prompt_contains_all_candidate_symbols():
    from backend.services.bull import _build_score_prompt
    candidates = [
        {"symbol": "AAPL", "close": 185.0, "rsi14": 52.0, "iv": 0.34, "ivr": 34.0, "atm_oi": 800, "sector": "XLK"},
        {"symbol": "MSFT", "close": 415.0, "rsi14": 48.0, "iv": 0.28, "ivr": 28.0, "atm_oi": 600, "sector": "XLK"},
    ]
    macro = {"spy": {"regime": "bullish", "close": 535.0, "sma50": 520.0}, "qqq": {"regime": "bullish"}}
    sectors = [{"symbol": "XLK", "label": "strong", "pct_vs_20d": 1.2}]
    rules = ["Only enter when RSI is between 40 and 60"]
    prompt = _build_score_prompt(candidates, macro, sectors, rules)
    assert "AAPL" in prompt
    assert "MSFT" in prompt
    assert "bullish" in prompt
    assert "XLK" in prompt
    assert "RSI is between 40 and 60" in prompt


def test_score_candidates_returns_fallback_without_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    import importlib
    import backend.services.bull as bull_svc
    importlib.reload(bull_svc)
    candidates = [{"symbol": "AAPL", "close": 185.0, "rsi14": 52.0, "iv": 0.34, "ivr": 34.0, "atm_oi": 800}]
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "bullish"}}
    sectors = []
    result = bull_svc.score_candidates(candidates, macro, sectors, [])
    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["symbol"] == "AAPL"
    assert "score" in result[0]
