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
