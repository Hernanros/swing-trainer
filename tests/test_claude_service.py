import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.database import Base
from backend.models import User, Trade, SkillScore
from backend.services.claude import get_user_coaching_context


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def user(db):
    u = User(
        name="Alice",
        trading_stage="active",
        time_budget="30min",
        active_skills='["chart_reading", "entry_timing"]',
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_context_includes_user_profile(db, user):
    ctx = get_user_coaching_context(user, db)
    assert "Alice" in ctx
    assert "active" in ctx
    assert "30min" in ctx


def test_context_includes_weakest_skill(db, user):
    db.add(SkillScore(user_id=user.id, skill="chart_reading", score=42.0))
    db.add(SkillScore(user_id=user.id, skill="entry_timing", score=71.0))
    db.commit()
    ctx = get_user_coaching_context(user, db)
    assert "Chart Reading" in ctx
    assert "42" in ctx


def test_context_includes_recent_trades(db, user):
    db.add(Trade(
        user_id=user.id, symbol="AAPL", direction="long",
        setup_type="breakout", entry=100.0, stop=95.0, target=115.0,
        exit=114.0, shares=10, status="closed", date="2026-05-01",
        pnl=140.0, r_multiple=2.8, checklist_score=90.0,
    ))
    db.commit()
    ctx = get_user_coaching_context(user, db)
    assert "AAPL" in ctx
    assert "2.80R" in ctx
    assert "checklist 90%" in ctx


def test_context_omits_open_trades(db, user):
    db.add(Trade(
        user_id=user.id, symbol="TSLA", direction="long",
        entry=200.0, stop=190.0, target=230.0,
        shares=5, status="open", date="2026-05-20",
    ))
    db.commit()
    ctx = get_user_coaching_context(user, db)
    assert "TSLA" not in ctx


def test_context_no_data_returns_profile_only(db, user):
    ctx = get_user_coaching_context(user, db)
    assert "Alice" in ctx
    assert "Recent trades" not in ctx
    assert "Skill scores" not in ctx


def test_context_handles_null_r_multiple(db, user):
    db.add(Trade(
        user_id=user.id, symbol="MSFT", direction="long",
        entry=300.0, stop=290.0, target=330.0,
        shares=5, status="closed", date="2026-05-10",
        pnl=-50.0, r_multiple=None,
    ))
    db.commit()
    ctx = get_user_coaching_context(user, db)
    assert "MSFT" in ctx
    assert "?R" in ctx


def test_debrief_returns_unavailable_when_no_api_key(db, user):
    from backend.models import Trade
    trade = Trade(
        user_id=user.id, symbol="AAPL", direction="long",
        entry=150.0, stop=145.0, target=165.0, exit=162.0,
        shares=10, status="closed", date="2026-06-01",
        pnl=120.0, r_multiple=2.4, trade_type="equity",
    )
    db.add(trade)
    db.commit()
    from backend.services import claude as svc
    result = svc.generate_trade_debrief(trade)
    assert "unavailable" in result.lower()


def test_debrief_accepts_coaching_context_param(db, user):
    from backend.models import Trade
    trade = Trade(
        user_id=user.id, symbol="AAPL", direction="long",
        entry=150.0, stop=145.0, target=165.0, exit=162.0,
        shares=10, status="closed", date="2026-06-01",
        pnl=120.0, r_multiple=2.4, trade_type="equity",
    )
    db.add(trade)
    db.commit()
    from backend.services import claude as svc
    # Must accept the new parameter without error
    result = svc.generate_trade_debrief(trade, coaching_context="User: Alice | Stage: active")
    assert "unavailable" in result.lower()


def test_debrief_accepts_option_spread_trade(db, user):
    from backend.models import Trade
    trade = Trade(
        user_id=user.id, symbol="SPY", direction="long",
        trade_type="option_spread", option_spread_type="bull_call",
        option_long_strike=450.0, option_short_strike=455.0,
        option_expiry="2026-07-18",
        entry=1.50, stop=0.75, target=3.00, exit=3.00,
        shares=2, status="closed", date="2026-06-01",
        pnl=300.0, r_multiple=1.0,
    )
    db.add(trade)
    db.commit()
    from backend.services import claude as svc
    # Must not crash when trade_type is option_spread (no API key, so returns unavailable)
    result = svc.generate_trade_debrief(trade)
    assert "unavailable" in result.lower()


# ---------------------------------------------------------------------------
# Tests for _build_debrief_prompt (07-04)
# ---------------------------------------------------------------------------

def test_debrief_prompt_includes_pre_trade_advisory_for_option_spread(db, user):
    from backend.models import Trade
    from backend.services.claude import _build_debrief_prompt
    trade = Trade(
        user_id=user.id, symbol="SPY", direction="long",
        trade_type="option_spread", option_spread_type="bull_put",
        option_long_strike=445.0, option_short_strike=440.0,
        option_expiry="2026-07-18",
        entry=1.20, stop=0.60, target=2.40, exit=2.40,
        shares=1, status="closed", date="2026-06-01",
        pnl=120.0, r_multiple=1.0,
        pre_trade_advisory="Strikes are too tight at 1% width",
    )
    db.add(trade)
    db.commit()
    prompt = _build_debrief_prompt(trade)
    assert "Strikes are too tight at 1% width" in prompt
    assert "compare whether the outcome matched" in prompt


def test_debrief_prompt_omits_advisory_when_none(db, user):
    from backend.models import Trade
    from backend.services.claude import _build_debrief_prompt
    trade = Trade(
        user_id=user.id, symbol="SPY", direction="long",
        trade_type="option_spread", option_spread_type="bull_put",
        option_long_strike=445.0, option_short_strike=440.0,
        option_expiry="2026-07-18",
        entry=1.20, stop=0.60, target=2.40, exit=2.40,
        shares=1, status="closed", date="2026-06-01",
        pnl=120.0, r_multiple=1.0,
        pre_trade_advisory=None,
    )
    db.add(trade)
    db.commit()
    prompt = _build_debrief_prompt(trade)
    assert "Pre-trade advisory" not in prompt
    assert "compare whether the outcome matched" not in prompt


def test_debrief_prompt_omits_advisory_when_empty_string(db, user):
    from backend.models import Trade
    from backend.services.claude import _build_debrief_prompt
    trade = Trade(
        user_id=user.id, symbol="SPY", direction="long",
        trade_type="option_spread", option_spread_type="bull_put",
        option_long_strike=445.0, option_short_strike=440.0,
        option_expiry="2026-07-18",
        entry=1.20, stop=0.60, target=2.40, exit=2.40,
        shares=1, status="closed", date="2026-06-01",
        pnl=120.0, r_multiple=1.0,
        pre_trade_advisory="",
    )
    db.add(trade)
    db.commit()
    prompt = _build_debrief_prompt(trade)
    assert "Pre-trade advisory" not in prompt
    assert "compare whether the outcome matched" not in prompt


def test_debrief_prompt_omits_advisory_for_equity_trade(db, user):
    from backend.models import Trade
    from backend.services.claude import _build_debrief_prompt
    trade = Trade(
        user_id=user.id, symbol="AAPL", direction="long",
        trade_type="equity",
        entry=150.0, stop=145.0, target=165.0, exit=162.0,
        shares=10, status="closed", date="2026-06-01",
        pnl=120.0, r_multiple=2.4,
        pre_trade_advisory="should not appear",
    )
    db.add(trade)
    db.commit()
    prompt = _build_debrief_prompt(trade)
    assert "should not appear" not in prompt
