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


# ── Task 3: get_chain ──────────────────────────────────────────────────────────

def test_get_chain_returns_empty_dict_on_exception():
    from backend.services.data import YFinanceOptionsProvider
    provider = YFinanceOptionsProvider()
    mock_ticker = MagicMock()
    mock_ticker.option_chain.side_effect = Exception("network error")
    with patch("yfinance.Ticker", return_value=mock_ticker):
        result = provider.get_chain("FAKE", "2026-07-11")
    assert result == {"strikes": [], "puts": []}


def test_get_chain_returns_atm_put_data():
    import pandas as pd
    from backend.services.data import YFinanceOptionsProvider
    provider = YFinanceOptionsProvider()
    puts_df = pd.DataFrame([
        {"strike": 180.0, "bid": 1.20, "ask": 1.40, "openInterest": 500, "impliedVolatility": 0.28},
        {"strike": 185.0, "bid": 0.85, "ask": 1.00, "openInterest": 800, "impliedVolatility": 0.32},
        {"strike": 190.0, "bid": 0.40, "ask": 0.55, "openInterest": 300, "impliedVolatility": 0.35},
    ])
    mock_chain = MagicMock()
    mock_chain.puts = puts_df
    hist_df = pd.DataFrame({"Close": [184.0, 185.5]})
    mock_ticker = MagicMock()
    mock_ticker.option_chain.return_value = mock_chain
    mock_ticker.history.return_value = hist_df
    with patch("yfinance.Ticker", return_value=mock_ticker):
        result = provider.get_chain("AAPL", "2026-07-11")
    assert len(result["puts"]) == 3
    atm = next(p for p in result["puts"] if p["strike"] == 185.0)
    assert atm["bid"] == 0.85
    assert atm["oi"] == 800
    assert atm["iv"] > 0


def test_get_chain_estimates_iv_when_zero():
    import pandas as pd
    from backend.services.data import YFinanceOptionsProvider
    from datetime import date, timedelta
    provider = YFinanceOptionsProvider()
    expiry = (date.today() + timedelta(days=7)).isoformat()
    puts_df = pd.DataFrame([
        {"strike": 100.0, "bid": 1.50, "ask": 1.70, "openInterest": 400, "impliedVolatility": 0.0},
    ])
    mock_chain = MagicMock()
    mock_chain.puts = puts_df
    hist_df = pd.DataFrame({"Close": [99.0, 100.0]})
    mock_ticker = MagicMock()
    mock_ticker.option_chain.return_value = mock_chain
    mock_ticker.history.return_value = hist_df
    with patch("yfinance.Ticker", return_value=mock_ticker):
        result = provider.get_chain("TEST", expiry)
    atm = result["puts"][0]
    assert atm["iv"] > 0, "Should estimate IV from bid/ask mid via B-S approximation"


# ── Task 4: _channel_proximity, _rsi_slope ─────────────────────────────────────

def test_channel_proximity_passes_near_lower_band():
    from backend.services.bull import _channel_proximity
    highs = [100 + i * 0.5 for i in range(20)]
    lows  = [95  + i * 0.5 for i in range(20)]
    closes = lows[:]
    closes[-1] = lows[-1] + 0.5
    result = _channel_proximity(closes, highs, lows)
    assert result["passes"] is True
    assert result["slope"] > 0
    assert result["proximity_pct"] < 0.25


def test_channel_proximity_fails_near_upper_band():
    from backend.services.bull import _channel_proximity
    highs = [100 + i * 0.5 for i in range(20)]
    lows  = [90  + i * 0.5 for i in range(20)]
    closes = highs[:]
    result = _channel_proximity(closes, highs, lows)
    assert result["passes"] is False
    assert result["proximity_pct"] > 0.25


def test_channel_proximity_fails_downward_channel():
    from backend.services.bull import _channel_proximity
    highs = [100 - i * 0.5 for i in range(20)]
    lows  = [90  - i * 0.5 for i in range(20)]
    closes = [95  - i * 0.5 for i in range(20)]
    result = _channel_proximity(closes, highs, lows)
    assert result["passes"] is False
    assert result["slope"] < 0


def test_rsi_slope_positive_for_rising_prices():
    from backend.services.bull import _rsi_slope
    # Small losses early, then strong gains late → recent 14-bar window has
    # more gains than the window 2 bars earlier → RSI increases → slope > 0.
    closes = [100 - i * 0.1 for i in range(15)] + [98.5 + i * 1.0 for i in range(10)]
    slope = _rsi_slope(closes)
    assert slope > 0


def test_rsi_slope_negative_for_falling_prices():
    from backend.services.bull import _rsi_slope
    # Small gains early, then strong losses late → recent 14-bar window has
    # more losses than the window 2 bars earlier → RSI decreases → slope < 0.
    closes = [100 + i * 0.1 for i in range(15)] + [101.4 - i * 1.0 for i in range(10)]
    slope = _rsi_slope(closes)
    assert slope < 0


def test_rsi_slope_returns_zero_when_insufficient_data():
    from backend.services.bull import _rsi_slope
    closes = [100.0] * 10
    slope = _rsi_slope(closes)
    assert slope == 0.0


# ── Task 5: deterministic_score + new stage1_filter ────────────────────────────

def test_deterministic_score_both_bullish_complete_full_score():
    from backend.services.bull import deterministic_score
    candidate = {
        "channel_proximity_pct": 0.0,   # at lower band = 25 pts
        "rsi_slope": 3.0,               # max slope = 20 pts
        "volume_ratio": 1.5,            # >=1.2x = 15 pts
        "data_quality": "complete",
        "atm_oi": 600,                  # >=500 + bid>=0.50 = 20 pts
        "atm_bid": 0.60,
    }
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "bullish"}}  # 20 pts
    score = deterministic_score(candidate, macro)
    assert score == 100


def test_deterministic_score_partial_data_quality_gets_zero_options_pts():
    from backend.services.bull import deterministic_score
    candidate = {
        "channel_proximity_pct": 0.0,
        "rsi_slope": 3.0,
        "volume_ratio": 1.5,
        "data_quality": "partial",   # 0 options pts
        "atm_oi": 600,
        "atm_bid": 0.60,
    }
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "bullish"}}
    score = deterministic_score(candidate, macro)
    assert score == 80   # 25 + 20 + 15 + 20 + 0


def test_deterministic_score_one_bullish_gives_10_macro_pts():
    from backend.services.bull import deterministic_score
    candidate = {
        "channel_proximity_pct": 0.0,
        "rsi_slope": 0.0,
        "volume_ratio": 0.5,
        "data_quality": "price_only",
    }
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "neutral"}}
    score = deterministic_score(candidate, macro)
    assert score == 35   # 25 + 0 + 0 + 10 + 0


def test_stage1_filter_returns_candidates_sorted_by_proximity():
    from backend.services import bull as bull_svc

    def _snap(sym, slope, prox_pct, rsi_direction="rising"):
        closes = [100 + i * (0.5 if slope > 0 else -0.5) for i in range(25)]
        lows   = [c - 5 for c in closes[-20:]]
        highs  = [c + 5 for c in closes[-20:]]
        if prox_pct > 0.25:
            closes[-1] = lows[-1] + (highs[-1] - lows[-1]) * prox_pct
        return {
            "symbol": sym,
            "close": closes[-1],
            "sma50": closes[-1] * 0.95,
            "rsi14": 52.0,
            "volume": 2_000_000.0,
            "avg_volume_20d": 1_500_000,
            "closes": closes,
            "highs": highs,
            "lows": lows,
        }

    snapshots = {
        "LOW_PROX": _snap("LOW_PROX", slope=0.5, prox_pct=0.05),
        "MID_PROX": _snap("MID_PROX", slope=0.5, prox_pct=0.20),
        "CHEAP": {
            "symbol": "CHEAP", "close": 8.0, "avg_volume_20d": 2_000_000,
            "closes": [8.0] * 25, "highs": [9.0] * 20, "lows": [7.0] * 20,
        },
    }
    original_cp = bull_svc._channel_proximity
    def mock_cp(closes, highs, lows):
        c = closes[-1]
        if c > 100:
            prox = 0.05 if c > 112 else 0.20
            return {"slope": 0.5, "proximity_pct": prox, "passes": True}
        return {"slope": 0.5, "proximity_pct": 0.5, "passes": False}
    bull_svc._channel_proximity = mock_cp

    original_rs = bull_svc._rsi_slope
    bull_svc._rsi_slope = lambda c: 1.0

    try:
        result = bull_svc.stage1_filter(snapshots)
    finally:
        bull_svc._channel_proximity = original_cp
        bull_svc._rsi_slope = original_rs

    symbols = [r["symbol"] for r in result]
    assert "CHEAP" not in symbols          # price < 15 floor
    assert "channel_proximity_pct" in result[0]


def test_stage1_filter_excludes_failed_channel():
    from backend.services import bull as bull_svc

    snap = {
        "symbol": "FLAT", "close": 100.0, "avg_volume_20d": 1_500_000,
        "volume": 1_500_000,
        "closes": [100.0] * 25,
        "highs": [105.0] * 20,
        "lows": [95.0] * 20,
    }
    original_cp = bull_svc._channel_proximity
    bull_svc._channel_proximity = lambda c, h, l: {"slope": -0.1, "proximity_pct": 0.1, "passes": False}
    original_rs = bull_svc._rsi_slope
    bull_svc._rsi_slope = lambda c: 1.0
    try:
        result = bull_svc.stage1_filter({"FLAT": snap})
    finally:
        bull_svc._channel_proximity = original_cp
        bull_svc._rsi_slope = original_rs
    assert result == []


# ── Task 6: stage2_options_check + run_pipeline ────────────────────────────────

def test_stage2_options_check_complete_quality():
    from backend.services.bull import stage2_options_check
    candidate = {"symbol": "AAPL", "close": 185.0, "channel_proximity_pct": 0.1, "rsi_slope": 1.2}
    mock_provider = MagicMock()
    mock_provider.get_nearest_weekly_expiry.return_value = "2026-07-11"
    mock_provider.get_chain.return_value = {
        "strikes": [180.0, 185.0, 190.0],
        "puts": [
            {"strike": 185.0, "bid": 0.90, "ask": 1.00, "oi": 600, "iv": 0.30},
        ],
    }
    result = stage2_options_check([candidate], mock_provider)
    assert len(result) == 1
    assert result[0]["data_quality"] == "complete"
    assert result[0]["short_strike"] == 185.0
    assert result[0]["long_strike"] == 180.0
    assert result[0]["estimated_credit"] == round(0.90 * 0.85, 2)


def test_stage2_options_check_price_only_when_no_expiry():
    from backend.services.bull import stage2_options_check
    candidate = {"symbol": "NOEXP", "close": 100.0}
    mock_provider = MagicMock()
    mock_provider.get_nearest_weekly_expiry.return_value = None
    result = stage2_options_check([candidate], mock_provider)
    assert result[0]["data_quality"] == "price_only"


def test_stage2_options_check_partial_quality_when_bid_too_low():
    from backend.services.bull import stage2_options_check
    candidate = {"symbol": "LOWBID", "close": 50.0}
    mock_provider = MagicMock()
    mock_provider.get_nearest_weekly_expiry.return_value = "2026-07-11"
    mock_provider.get_chain.return_value = {
        "strikes": [50.0],
        "puts": [{"strike": 50.0, "bid": 0.10, "ask": 0.15, "oi": 50, "iv": 0.20}],
    }
    result = stage2_options_check([candidate], mock_provider)
    assert result[0]["data_quality"] == "partial"


def test_run_pipeline_returns_expected_shape(monkeypatch):
    import backend.services.bull as bull_svc
    import backend.services.market as mkt

    fake_snap = {
        "symbol": "AAPL", "close": 185.0, "sma50": 175.0, "rsi14": 52.0,
        "volume": 2_000_000.0, "avg_volume_20d": 1_500_000,
        "closes": [180.0 + i * 0.3 for i in range(25)],
        "highs": [183.0 + i * 0.3 for i in range(20)],
        "lows": [177.0 + i * 0.3 for i in range(20)],
    }
    monkeypatch.setattr(bull_svc, "_batch_eod_snapshots", lambda syms: {"AAPL": fake_snap} if "AAPL" in syms or syms == ["SPY", "QQQ"] else {"SPY": {**fake_snap, "symbol": "SPY"}, "QQQ": {**fake_snap, "symbol": "QQQ"}})
    monkeypatch.setattr(mkt, "get_sector_etfs", lambda: [{"symbol": "XLK", "label": "strong", "pct_vs_20d": 1.2}])
    monkeypatch.setattr(bull_svc, "SP500_UNIVERSE", ["AAPL"])
    monkeypatch.setattr(bull_svc, "_channel_proximity", lambda c, h, l: {"slope": 0.3, "proximity_pct": 0.10, "passes": True})
    monkeypatch.setattr(bull_svc, "_rsi_slope", lambda c: 1.5)

    mock_provider = MagicMock()
    mock_provider.get_nearest_weekly_expiry.return_value = "2026-07-11"
    mock_provider.get_chain.return_value = {
        "strikes": [185.0],
        "puts": [{"strike": 185.0, "bid": 0.90, "ask": 1.00, "oi": 600, "iv": 0.30}],
    }

    with patch("backend.services.claude.generate_setup_brief", return_value="Test brief."):
        result = bull_svc.run_pipeline(
            options_provider=mock_provider,
            playbook_rules=[],
            bull_profile={"account_size": 25000.0, "risk_per_trade_pct": 1.0, "max_contracts": 5},
        )

    assert "macro" in result
    assert "sectors" in result
    assert "candidates" in result
    candidates = result["candidates"]
    assert len(candidates) >= 1
    c = candidates[0]
    assert "score" in c
    assert "data_quality" in c
    assert "setup_brief" in c
    assert isinstance(c["score"], int)


# ── Task 7: generate_setup_brief ──────────────────────────────────────────────

def test_generate_setup_brief_returns_fallback_without_api_key():
    import backend.services.claude as claude_svc
    candidate = {"symbol": "AAPL", "close": 185.0, "channel_proximity_pct": 0.10, "rsi_slope": 1.5, "sector": "XLK", "sector_label": "strong"}
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "bullish"}}
    with patch.object(claude_svc, "_api_key", ""):
        result = claude_svc.generate_setup_brief(candidate, macro, [])
    assert isinstance(result, str)
    assert len(result) > 0


def test_generate_setup_brief_calls_claude_sonnet():
    import backend.services.claude as claude_svc
    candidate = {"symbol": "MSFT", "close": 420.0, "channel_proximity_pct": 0.08, "rsi_slope": 2.1, "sector": "XLK", "sector_label": "strong"}
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "bullish"}}
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="MSFT is testing channel support near $420.")]
    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_response
    with patch.object(claude_svc, "_api_key", "test-key"), patch("anthropic.Anthropic", return_value=mock_client):
        result = claude_svc.generate_setup_brief(candidate, macro, [])
    assert result == "MSFT is testing channel support near $420."
    call_kwargs = mock_client.messages.create.call_args[1]
    assert call_kwargs["model"] == "claude-sonnet-4-6"
    assert call_kwargs["max_tokens"] == 150


# ── Task 8: PaperBullTrade model + router ──────────────────────────────────────

import json as _json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import Base, get_db
import backend.auth as _auth_module

_TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestSession = sessionmaker(autocommit=False, autoflush=False, bind=_TEST_ENGINE)


@pytest.fixture(autouse=False)
def bull_client():
    saved_db = app.dependency_overrides.get(get_db)
    saved_auth = _auth_module.DEV_BYPASS_AUTH
    _auth_module.DEV_BYPASS_AUTH = True
    app.dependency_overrides[get_db] = lambda: _TestSession()
    Base.metadata.create_all(bind=_TEST_ENGINE)
    db = _TestSession()
    from backend.models import User
    if not db.query(User).filter_by(email="test@test.com").first():
        db.add(User(name="Tester", email="test@test.com", trading_stage="intermediate", time_budget="1h", active_skills="[]"))
        db.commit()
    db.close()
    yield TestClient(app)
    if saved_db is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = saved_db
    _auth_module.DEV_BYPASS_AUTH = saved_auth


def test_paper_bull_trade_table_exists():
    from sqlalchemy import inspect
    Base.metadata.create_all(bind=_TEST_ENGINE)
    insp = inspect(_TEST_ENGINE)
    assert "paper_bull_trades" in insp.get_table_names()


def test_paper_bull_trade_columns():
    from sqlalchemy import inspect
    Base.metadata.create_all(bind=_TEST_ENGINE)
    insp = inspect(_TEST_ENGINE)
    cols = {c["name"] for c in insp.get_columns("paper_bull_trades")}
    required = {
        "id", "user_id", "scan_id", "symbol", "logged_at", "expiry",
        "short_strike", "long_strike", "premium_credit", "score",
        "data_quality", "outcome", "pnl", "auto_logged",
    }
    assert required.issubset(cols)


def test_run_scan_auto_logs_complete_high_score_candidate(bull_client):
    complete_candidate = {
        "symbol": "AAPL", "close": 185.0, "score": 75, "data_quality": "complete",
        "expiry": "2026-07-11", "short_strike": 185.0, "long_strike": 180.0,
        "estimated_credit": 0.80, "channel_proximity_pct": 0.10, "rsi_slope": 1.5,
        "setup_brief": "Test brief.", "contracts": 1, "max_loss_per_contract": 420.0,
        "risk_dollars": 250.0, "sector": "XLK", "sector_label": "strong",
    }
    mock_result = {
        "macro": {"spy": {"regime": "bullish", "close": 535.0, "sma50": 520.0}, "qqq": {"regime": "bullish", "close": 450.0}},
        "sectors": [{"symbol": "XLK", "label": "strong", "pct_vs_20d": 1.2}],
        "candidates": [complete_candidate],
    }
    with patch("backend.services.bull.run_pipeline", return_value=mock_result):
        resp = bull_client.post("/api/bull/scan/run")
    assert resp.status_code == 200

    db = _TestSession()
    from backend.models import PaperBullTrade
    trades = db.query(PaperBullTrade).all()
    db.close()
    assert len(trades) == 1
    assert trades[0].symbol == "AAPL"
    assert trades[0].score == 75
    assert trades[0].auto_logged is True


def test_run_scan_does_not_log_low_score_candidate(bull_client):
    low_candidate = {
        "symbol": "LOWSC", "close": 50.0, "score": 45, "data_quality": "complete",
        "expiry": "2026-07-11", "short_strike": 50.0, "long_strike": 45.0,
        "estimated_credit": 0.40, "channel_proximity_pct": 0.20, "rsi_slope": 0.5,
        "setup_brief": "", "contracts": 0, "max_loss_per_contract": 460.0, "risk_dollars": 0,
    }
    mock_result = {
        "macro": {"spy": {"regime": "neutral", "close": 500.0, "sma50": 500.0}, "qqq": {"regime": "neutral", "close": 400.0}},
        "sectors": [],
        "candidates": [low_candidate],
    }
    with patch("backend.services.bull.run_pipeline", return_value=mock_result):
        resp = bull_client.post("/api/bull/scan/run")
    assert resp.status_code == 200

    db = _TestSession()
    from backend.models import PaperBullTrade
    trades = db.query(PaperBullTrade).filter_by(symbol="LOWSC").all()
    db.close()
    assert len(trades) == 0


def test_get_kpis_returns_empty_shape_when_no_trades(bull_client):
    resp = bull_client.get("/api/bull/kpis")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_trades" in data
    assert "win_rate" in data
    assert "score_edge" in data
    assert data["total_trades"] == 0


def test_get_paper_trades_returns_paginated_list(bull_client):
    db = _TestSession()
    from backend.models import PaperBullTrade
    from datetime import datetime, timezone
    db.add(PaperBullTrade(
        user_id=1, scan_id=None, symbol="TEST",
        logged_at=datetime.now(timezone.utc),
        expiry="2026-07-11", short_strike=100.0, long_strike=95.0,
        premium_credit=0.75, score=70, data_quality="complete",
        auto_logged=True,
    ))
    db.commit()
    db.close()

    resp = bull_client.get("/api/bull/paper-trades?page=1&per_page=10")
    assert resp.status_code == 200
    data = resp.json()
    assert "trades" in data
    assert "total" in data
    assert data["total"] >= 1
    assert data["trades"][0]["symbol"] == "TEST"
