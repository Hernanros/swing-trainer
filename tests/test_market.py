import json
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import backend.auth as auth_module
from backend.main import app
from backend.database import Base, get_db
from backend.auth import require_auth

TEST_DB_URL = "sqlite://"
_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def override_get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[require_auth] = lambda: None
auth_module.DEV_BYPASS_AUTH = True


@pytest.fixture(autouse=True)
def reset_db():
    prior = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)
    if prior is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = prior


client = TestClient(app)

FAKE_CANDLES = [
    {"time": 1700000000, "open": 100.0, "high": 105.0, "low": 98.0, "close": 103.0, "volume": 1000000},
    {"time": 1700086400, "open": 103.0, "high": 108.0, "low": 101.0, "close": 106.0, "volume": 1100000},
]


def test_candles_without_date_returns_data():
    # Patch at get_candles level — avoids env-key guards in service internals
    with patch("backend.services.market.get_candles", return_value=FAKE_CANDLES):
        resp = client.get("/api/market/candles/NVDA")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_candles_with_date_returns_data():
    with patch("backend.services.market.get_candles", return_value=FAKE_CANDLES):
        resp = client.get("/api/market/candles/NVDA?date=2026-01-15&days=60")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_candles_with_date_are_cached_in_db():
    with patch("backend.services.market.get_candles", return_value=FAKE_CANDLES):
        client.get("/api/market/candles/NVDA?date=2026-01-15&days=60")
    # Second call — get_candles should NOT be called (served from DB cache)
    with patch("backend.services.market.get_candles", side_effect=Exception("should not call")) as mock:
        resp = client.get("/api/market/candles/NVDA?date=2026-01-15&days=60")
        mock.assert_not_called()
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_fetch_candles_passes_end_date_to_twelvedata():
    # Unit test: directly verify the service computes end_date = date + 10 days
    from backend.services import market as mkt
    with patch.object(mkt, "_TWELVEDATA_KEY", "fake-key"), \
         patch("backend.services.market._fetch_twelvedata_candles", return_value=FAKE_CANDLES) as mock_td:
        mkt._fetch_candles("NVDA", 60, date="2026-01-15")
    mock_td.assert_called_once_with("NVDA", 60, end_date="2026-01-25")
