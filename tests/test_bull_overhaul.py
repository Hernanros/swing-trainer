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
