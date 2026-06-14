import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from backend.models import Base, BullProfile, BullScan
from fastapi.testclient import TestClient


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_bull_profile_table_exists(db):
    insp = inspect(db.bind)
    assert "bull_profiles" in insp.get_table_names()


def test_bull_scan_table_exists(db):
    insp = inspect(db.bind)
    assert "bull_scans" in insp.get_table_names()


def test_bull_profile_columns(db):
    insp = inspect(db.bind)
    cols = {c["name"] for c in insp.get_columns("bull_profiles")}
    assert {"id", "user_id", "account_size", "risk_per_trade_pct", "max_contracts", "updated_at"}.issubset(cols)


def test_bull_scan_columns(db):
    insp = inspect(db.bind)
    cols = {c["name"] for c in insp.get_columns("bull_scans")}
    assert {"id", "user_id", "scan_date", "macro_json", "sectors_json", "results_json", "created_at"}.issubset(cols)


def test_bull_profiles_table_created_on_startup():
    from backend.main import app
    with TestClient(app):
        pass
    from backend.database import engine as db_engine
    insp = inspect(db_engine)
    assert "bull_profiles" in insp.get_table_names()


def test_bull_scans_table_created_on_startup():
    from backend.main import app
    with TestClient(app):
        pass
    from backend.database import engine as db_engine
    insp = inspect(db_engine)
    assert "bull_scans" in insp.get_table_names()


# ── Task 4: Pydantic schemas ──────────────────────────────────────────────────

from backend.schemas import BullProfileCreate, BullProfileResponse, BullChatRequest, BullScanResponse


def test_bull_profile_create_schema():
    p = BullProfileCreate(account_size=25000.0, risk_per_trade_pct=1.0, max_contracts=5)
    assert p.account_size == 25000.0
    assert p.risk_per_trade_pct == 1.0
    assert p.max_contracts == 5


def test_bull_profile_create_defaults():
    p = BullProfileCreate(account_size=10000.0)
    assert p.risk_per_trade_pct == 1.0
    assert p.max_contracts == 5


def test_bull_chat_request_schema():
    r = BullChatRequest(question="Why did AAPL score highest?")
    assert r.question == "Why did AAPL score highest?"
    assert r.context_symbol is None


def test_bull_chat_request_with_symbol():
    r = BullChatRequest(question="Explain the sizing", context_symbol="AAPL")
    assert r.context_symbol == "AAPL"


def test_bull_scan_response_schema():
    resp = BullScanResponse(
        scan_date="2026-06-14",
        macro={"spy": {"regime": "bullish"}, "qqq": {"regime": "bullish"}},
        sectors=[{"symbol": "XLK", "label": "strong", "pct_vs_20d": 1.2}],
        candidates=[{"symbol": "AAPL", "score": 8.4}],
        created_at="2026-06-14T17:02:00"
    )
    assert resp.scan_date == "2026-06-14"
    assert len(resp.candidates) == 1


# ── Task 5: Options data abstraction layer ────────────────────────────────────

from unittest.mock import patch, MagicMock


def test_options_provider_factory_returns_yfinance_by_default(monkeypatch):
    monkeypatch.delenv("TRADIER_API_KEY", raising=False)
    from backend.services.options import get_options_provider, YFinanceOptionsProvider
    provider = get_options_provider()
    assert isinstance(provider, YFinanceOptionsProvider)


def test_options_provider_factory_returns_tradier_when_key_set(monkeypatch):
    monkeypatch.setenv("TRADIER_API_KEY", "fake-key")
    import importlib
    import backend.services.options as opt_module
    importlib.reload(opt_module)
    from backend.services.options import get_options_provider, TradierOptionsProvider
    provider = get_options_provider()
    assert isinstance(provider, TradierOptionsProvider)
    monkeypatch.delenv("TRADIER_API_KEY", raising=False)
    importlib.reload(opt_module)


def test_yfinance_provider_returns_none_on_error():
    from backend.services.options import YFinanceOptionsProvider
    provider = YFinanceOptionsProvider()
    with patch("yfinance.Ticker") as mock_ticker:
        mock_ticker.return_value.options = []  # no expirations
        result = provider.get_options_snapshot("FAKE")
    assert result is None


def test_tradier_provider_raises_not_implemented():
    from backend.services.options import TradierOptionsProvider
    provider = TradierOptionsProvider()
    with pytest.raises(NotImplementedError):
        provider.get_options_snapshot("AAPL")


# ── Task 6: Market service extensions ────────────────────────────────────────

def test_sector_etfs_constant_has_11_symbols():
    from backend.services.market import SECTOR_ETFS
    assert len(SECTOR_ETFS) == 11
    assert "XLK" in SECTOR_ETFS
    assert "XLF" in SECTOR_ETFS


def test_get_sector_etfs_returns_list_of_dicts(monkeypatch):
    from backend.services import market as mkt
    fake_candles = [
        {"time": 1000 + i, "open": 100.0, "high": 102.0, "low": 99.0,
         "close": 100.0 + i * 0.1, "volume": 1000000}
        for i in range(25)
    ]
    monkeypatch.setattr(mkt, "_fetch_candles", lambda sym, days, **kw: fake_candles)
    result = mkt.get_sector_etfs()
    assert isinstance(result, list)
    assert len(result) == 11
    assert "symbol" in result[0]
    assert "pct_vs_20d" in result[0]
    assert "label" in result[0]


def test_get_eod_snapshot_returns_dict_with_required_keys(monkeypatch):
    from backend.services import market as mkt
    fake_candles = [
        {"time": 1000 + i, "open": 100.0, "high": 105.0, "low": 95.0,
         "close": 100.0 + i * 0.5, "volume": 2000000}
        for i in range(55)
    ]
    monkeypatch.setattr(mkt, "_fetch_candles", lambda sym, days, **kw: fake_candles)
    result = mkt.get_eod_snapshot("AAPL")
    assert result is not None
    assert "symbol" in result
    assert "close" in result
    assert "sma50" in result
    assert "rsi14" in result
    assert "avg_volume_20d" in result
    assert "volume" in result
