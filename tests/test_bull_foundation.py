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
