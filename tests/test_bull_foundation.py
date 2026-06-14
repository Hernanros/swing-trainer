import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from backend.models import Base, BullProfile, BullScan


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
