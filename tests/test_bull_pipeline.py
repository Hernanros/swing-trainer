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


def test_run_pipeline_returns_expected_shape(monkeypatch):
    import backend.services.bull as bull_svc
    import backend.services.market as mkt
    fake_snap = {"symbol": "AAPL", "close": 185.0, "sma50": 180.0, "rsi14": 52.0,
                 "volume": 2000000, "avg_volume_20d": 1500000}
    monkeypatch.setattr(mkt, "get_eod_snapshot", lambda sym: fake_snap if sym == "AAPL" else None)
    monkeypatch.setattr(mkt, "get_sector_etfs", lambda: [{"symbol": "XLK", "label": "strong", "pct_vs_20d": 1.2, "close": 200.0}])
    monkeypatch.setattr(mkt, "_fetch_candles", lambda sym, days, **kw: [{"close": 530.0 + i * 0.1} for i in range(55)])
    mock_opts = MagicMock()
    mock_opts.get_options_snapshot.return_value = {"iv": 0.34, "ivr": 34.0, "atm_oi": 800, "atm_spread_pct": 0.08, "nearest_expiry": "2026-07-18", "atm_strike": 185.0}
    monkeypatch.setattr(bull_svc, "score_candidates", lambda c, m, s, r: [{**x, "score": 8.0, "rationale": "test"} for x in c])
    monkeypatch.setattr(bull_svc, "SP500_UNIVERSE", ["AAPL"])
    result = bull_svc.run_pipeline(
        options_provider=mock_opts,
        playbook_rules=[],
        bull_profile={"account_size": 25000.0, "risk_per_trade_pct": 1.0, "max_contracts": 5},
    )
    assert "macro" in result
    assert "sectors" in result
    assert "candidates" in result
    assert isinstance(result["candidates"], list)


# ── Task 7: Bull API endpoints ────────────────────────────────────────────────

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import get_db, Base
from backend.auth import require_auth
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
    app.dependency_overrides[require_auth] = lambda: user
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
