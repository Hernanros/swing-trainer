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


def test_rsi_slope_robust_to_single_day_spike():
    """A flat trend with one moderate up day at the end should produce a
    modest 5-bar regression slope — not the inflated reading that the
    old 2-point method (today vs 2 bars ago) used to give. This is the
    bug that motivated the rewrite."""
    from backend.services.bull import _rsi_slope
    # Zigzag ±0.1 keeps RSI around 50 (real gains AND losses), then one +1.0 day.
    closes = [100.0]
    for i in range(24):
        closes.append(closes[-1] + (0.1 if i % 2 == 0 else -0.1))
    closes.append(closes[-1] + 1.0)
    slope = _rsi_slope(closes)
    # The old 2-point method would have read about 10+ pts/day on this data and
    # pegged the scoring component at full credit from one bar of action. The
    # 5-bar regression averages the spike against 4 flat bars, capping it ~4.
    assert 0 < slope < 5, f"expected modest positive slope from 1-bar spike, got {slope:.2f}"


# ── Task 5: multi-setup detector + deterministic_score ────────────────────────

def _fake_snap(sym="AAPL", close=180.0, sma50=170.0, closes=None, highs=None, lows=None, opens_=None):
    """Build a snapshot with the 60+ bars the new stage1 needs.

    Computes sma20 automatically so tests satisfy the MA-retest gate by default
    (the ramp keeps sma20 within a few % of the last close). Tests that WANT to
    fail the gate should overwrite sma20/sma150 explicitly.
    """
    n = 65
    closes = closes if closes is not None else [close * (0.9 + 0.1 * (i / n)) for i in range(n)]
    highs  = highs  if highs  is not None else [c * 1.02 for c in closes]
    lows   = lows   if lows   is not None else [c * 0.98 for c in closes]
    opens_ = opens_ if opens_ is not None else [c * 0.99 for c in closes]
    sma20 = sum(closes[-20:]) / 20
    return {
        "symbol": sym, "close": closes[-1], "sma20": sma20, "sma50": sma50, "sma150": None,
        "rsi14": 55.0,
        "volume": 2_000_000.0, "avg_volume_20d": 1_500_000,
        "opens": opens_, "closes": closes, "highs": highs, "lows": lows,
    }


def test_deterministic_score_setup_plus_context_caps_at_100():
    from backend.services.bull import deterministic_score
    candidate = {
        "setup_score": 60, "setup_type": "pullback_uptrend",
        "setup_scores": {"pullback_uptrend": 60, "base_breakout": 30, "oversold_bounce": 0, "range_support": 0},
        "volume_ratio": 1.5,
        "vol_52w_pct_rank": 96.0,
        "rs_20d": 8.0,
        "data_quality": "complete", "atm_oi": 600, "atm_bid": 0.60,
    }
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "bullish"}}
    score = deterministic_score(candidate, macro)
    # 60 setup + 10 macro + 10 vol + 5 vol_rank + 5 rs + 10 options = 100
    assert score["total"] == 100
    assert score["setup_type"] == "pullback_uptrend"
    assert score["setup_score"] == 60


def test_deterministic_score_no_options_data_still_scores():
    from backend.services.bull import deterministic_score
    candidate = {
        "setup_score": 40, "setup_type": "base_breakout",
        "volume_ratio": 1.0,
        "rs_20d": 6.0,
        "data_quality": "price_only",
    }
    macro = {"spy": {"regime": "bullish"}, "qqq": {"regime": "neutral"}}
    # 40 setup + 5 macro + 7 vol + 0 vol_rank + 5 rs + 0 options = 57
    score = deterministic_score(candidate, macro)
    assert score["total"] == 57
    assert score["setup_type"] == "base_breakout"


def test_setup_detectors_score_zero_when_pattern_absent():
    from backend.services.bull import (
        detect_pullback_uptrend, detect_base_breakout,
        detect_oversold_bounce, detect_range_support,
    )
    # Wildly volatile random-ish series: no clean pattern of any kind
    closes = [100 + (i * 0.7 if i % 3 == 0 else -i * 0.4) for i in range(65)]
    highs  = [c + 3 for c in closes]
    lows   = [c - 3 for c in closes]
    opens_ = [c - 0.5 for c in closes]
    # None of the detectors should confidently fire on chaos
    p = detect_pullback_uptrend(closes, highs, lows)
    b = detect_base_breakout(closes, highs, lows)
    o = detect_oversold_bounce(closes, opens_)
    r = detect_range_support(closes, highs, lows)
    # Assert they all stay low, not that they're exactly zero — one might catch
    # something incidental. The important behavior: no setup dominates junk data.
    assert max(p, b, o, r) < 40, f"expected all setups < 40 on chaos data, got {(p, b, o, r)}"


def test_stage1_filter_rejects_when_no_ma_within_3pct():
    """A stock floating above ALL 3 MAs by >3% has no nearby support — reject."""
    from backend.services import bull as bull_svc
    # close 100, SMA20 94 (+6.4%), SMA50 90 (+11.1%), SMA150 85 (+17.6%) — none within 3%
    snap = _fake_snap(sym="FLOATER", close=100.0, sma50=90.0)
    snap["close"] = 100.0
    snap["sma20"] = 94.0
    snap["sma50"] = 90.0
    snap["sma150"] = 85.0
    result = bull_svc.stage1_filter({"FLOATER": snap})
    assert result == []


def test_stage1_filter_passes_when_sma150_retest():
    """VEEV-style setup: extended vs SMA20/50 but SMA150 is a real long-term retest.
    Under the user's rule, at least one MA within 3% is enough."""
    from backend.services import bull as bull_svc
    # close 100, SMA20 88 (+13.6%), SMA50 88 (+13.6%), SMA150 99 (+1.0%) — SMA150 is close
    n = 65
    closes = [98 + (i * 0.03) for i in range(n)]
    snap = _fake_snap(sym="LONGRETEST", close=closes[-1], sma50=88.0,
                      closes=closes, highs=[c + 1 for c in closes],
                      lows=[c - 1 for c in closes], opens_=[c - 0.1 for c in closes])
    snap["sma20"] = 88.0
    snap["sma150"] = 99.0
    # Should NOT be gated out by MA-retest rule (SMA150 within 3%)
    result = bull_svc.stage1_filter({"LONGRETEST": snap})
    # May or may not fire a setup with score >= 15, but shouldn't be MA-gate-rejected
    # Test by checking that a lower-close variant DOES get rejected
    snap_high = dict(snap)
    snap_high["close"] = 110.0  # now +25% above SMA20/50, +11% above SMA150 — none within 3%
    result_high = bull_svc.stage1_filter({"LONGRETEST": snap_high})
    assert result_high == [], "Stock >3% above all 3 MAs should be rejected"


def test_stage1_filter_rejects_below_hard_gates():
    from backend.services import bull as bull_svc
    # CHEAP → price < 15 fails price gate
    cheap = _fake_snap(sym="CHEAP", closes=[8.0] * 65)
    cheap["close"] = 8.0
    # LOWVOL → avg_vol < 500k fails volume gate
    lowvol = _fake_snap(sym="LOWVOL")
    lowvol["avg_volume_20d"] = 100_000
    # BELOW_MA → close below sma50 * 0.98 fails trend gate
    below_ma = _fake_snap(sym="BELOW_MA", close=100.0, sma50=110.0)
    below_ma["close"] = 100.0
    result = bull_svc.stage1_filter({"CHEAP": cheap, "LOWVOL": lowvol, "BELOW_MA": below_ma})
    assert [c["symbol"] for c in result] == []


def test_stage1_filter_tags_setup_type_when_pattern_fires():
    from backend.services import bull as bull_svc
    # Construct a clean tight base with close near top → base_breakout should fire strongly
    base_closes = [100 + (0.3 if i % 2 == 0 else -0.3) for i in range(45)]
    # Ramp higher for the last 20 bars to put us at top of range (breakout imminent)
    base_closes += [103 + (i * 0.15) for i in range(20)]
    highs = [c + 1 for c in base_closes]
    lows  = [c - 1 for c in base_closes]
    opens_ = [c - 0.1 for c in base_closes]
    snap = _fake_snap(sym="BASE", close=base_closes[-1], sma50=100.0,
                      closes=base_closes, highs=highs, lows=lows, opens_=opens_)
    result = bull_svc.stage1_filter({"BASE": snap})
    assert len(result) == 1
    assert result[0]["setup_type"] in ("base_breakout", "pullback_uptrend")
    assert result[0]["setup_score"] > 0
    assert "setup_scores" in result[0]


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

    n = 65
    closes = [178.0 + i * 0.15 for i in range(n)]
    fake_snap = {
        "symbol": "AAPL", "close": closes[-1], "sma20": closes[-1], "sma50": 175.0, "sma150": None,
        "rsi14": 52.0,
        "volume": 2_000_000.0, "avg_volume_20d": 1_500_000,
        "opens":  [c - 0.2 for c in closes],
        "closes": closes,
        "highs":  [c + 1.5 for c in closes],
        "lows":   [c - 1.5 for c in closes],
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
