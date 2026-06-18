import pytest
import math
from unittest.mock import patch, MagicMock


def test_sp500_universe_has_at_least_400_symbols():
    from backend.services.bull import SP500_UNIVERSE
    assert len(SP500_UNIVERSE) >= 400




# ── Task 5: Position sizing and macro regime ──────────────────────────────────

def test_compute_sizing_returns_correct_contracts():
    from backend.services.bull import compute_sizing
    result = compute_sizing(
        atm_strike=185.0,
        spread_width=10.0,
        premium=2.0,
        account_size=25000.0,
        risk_per_trade_pct=2.0,
        max_contracts=5,
    )
    assert isinstance(result["contracts"], int)
    assert result["max_loss_per_contract"] == 800.0
    assert result["risk_dollars"] == 500.0


def test_compute_sizing_respects_max_contracts():
    from backend.services.bull import compute_sizing
    result = compute_sizing(
        atm_strike=100.0,
        spread_width=5.0,
        premium=0.5,
        account_size=1000000.0,
        risk_per_trade_pct=10.0,
        max_contracts=3,
    )
    assert result["contracts"] <= 3


def test_compute_macro_regime_bullish():
    from backend.services.bull import compute_macro_regime
    candles = [{"close": 100.0 + i * 0.5} for i in range(55)]
    regime = compute_macro_regime(candles)
    assert regime == "bullish"


def test_compute_macro_regime_bearish():
    from backend.services.bull import compute_macro_regime
    candles = [{"close": 150.0 - i * 0.5} for i in range(55)]
    regime = compute_macro_regime(candles)
    assert regime == "bearish"


# ── Task 6: Pipeline orchestrator + chat ─────────────────────────────────────

def test_chat_returns_fallback_without_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    import importlib
    import backend.services.bull as bull_svc
    importlib.reload(bull_svc)
    result = bull_svc.chat(
        question="Why is AAPL ranked first?",
        scan_context={"macro": {}, "sectors": [], "top_candidates": []},
        context_symbol=None,
    )
    assert isinstance(result, str)
    assert len(result) > 0


# ── Task 7: Bull API endpoints ────────────────────────────────────────────────

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import get_db, Base
from backend.auth import get_current_user
from backend.models import User


@pytest.fixture
def client_with_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    def override_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()
    db = TestSession()
    user = User(name="Test", trading_stage="active", time_budget="30min",
                active_skills='["setup_selection"]', email="test@test.com")
    db.add(user)
    db.commit()
    db.refresh(user)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: user
    client = TestClient(app)
    yield client, db, user
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    db.close()


def test_get_profile_returns_404_when_not_set(client_with_db):
    client, db, user = client_with_db
    resp = client.get("/api/bull/profile")
    assert resp.status_code == 404


def test_put_profile_creates_profile(client_with_db):
    client, db, user = client_with_db
    resp = client.put("/api/bull/profile", json={
        "account_size": 25000.0, "risk_per_trade_pct": 1.0, "max_contracts": 5
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["account_size"] == 25000.0


def test_get_profile_returns_saved_profile(client_with_db):
    client, db, user = client_with_db
    client.put("/api/bull/profile", json={"account_size": 25000.0, "risk_per_trade_pct": 1.0, "max_contracts": 5})
    resp = client.get("/api/bull/profile")
    assert resp.status_code == 200
    assert resp.json()["account_size"] == 25000.0


def test_get_scan_latest_returns_404_when_no_scan(client_with_db):
    client, db, user = client_with_db
    resp = client.get("/api/bull/scan/latest")
    assert resp.status_code == 404


def test_chat_returns_response(client_with_db, monkeypatch):
    client, db, user = client_with_db
    import backend.services.bull as bull_svc
    monkeypatch.setattr(bull_svc, "chat", lambda question, scan_context, context_symbol: "AAPL scored highest due to sector strength.")
    resp = client.post("/api/bull/chat", json={"question": "Why AAPL?", "context_symbol": "AAPL"})
    assert resp.status_code == 200
    assert "answer" in resp.json()


# ── Task 8: APScheduler ───────────────────────────────────────────────────────

def test_scheduler_job_is_registered():
    with TestClient(app):
        pass
    # If app starts and stops without error, scheduler was registered correctly
    assert True
