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
