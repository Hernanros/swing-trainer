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
