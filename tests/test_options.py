import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app, lifespan
from backend.database import Base, get_db
import backend.auth as auth_module

TEST_DB_URL = "sqlite://"
_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

auth_module.DEV_BYPASS_AUTH = True


@pytest.fixture(autouse=True)
def reset_db():
    saved_db = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = lambda: _Session()
    Base.metadata.create_all(bind=_engine)
    db = _Session()
    from backend.models import User
    user = User(
        name="Tester",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=json.dumps(["chart_reading"]),
        email="test@example.com",
    )
    db.add(user)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved_db:
        app.dependency_overrides[get_db] = saved_db
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_trade_model_has_option_columns():
    with _engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(trades)"))]
    for col in ["trade_type", "option_expiry", "option_long_strike", "option_short_strike", "option_spread_type"]:
        assert col in cols, f"Missing column: {col}"


def test_compute_option_metrics_bull_call():
    from backend.routers.trades import _compute_option_metrics
    from backend.models import Trade
    t = Trade(
        option_spread_type="bull_call",
        option_long_strike=450.0,
        option_short_strike=455.0,
        entry=1.50,
        shares=2,
    )
    m = _compute_option_metrics(t)
    assert m["max_loss"]   == 300.0    # 1.50 * 2 * 100
    assert m["max_profit"] == 700.0    # (5 - 1.50) * 2 * 100
    assert m["breakeven"]  == 451.50   # 450 + 1.50


def test_compute_option_metrics_bear_put():
    from backend.routers.trades import _compute_option_metrics
    from backend.models import Trade
    t = Trade(
        option_spread_type="bear_put",
        option_long_strike=450.0,
        option_short_strike=445.0,
        entry=2.00,
        shares=1,
    )
    m = _compute_option_metrics(t)
    assert m["max_loss"]   == 200.0    # 2.00 * 1 * 100
    assert m["max_profit"] == 300.0    # (5 - 2) * 1 * 100
    assert m["breakeven"]  == 448.0    # 450 - 2.00


def test_compute_option_metrics_bull_put():
    from backend.routers.trades import _compute_option_metrics
    from backend.models import Trade
    t = Trade(
        option_spread_type="bull_put",
        option_long_strike=445.0,
        option_short_strike=450.0,
        entry=1.20,
        shares=1,
    )
    m = _compute_option_metrics(t)
    assert m["max_loss"]   == 380.0    # (5 - 1.20) * 1 * 100
    assert m["max_profit"] == 120.0    # 1.20 * 1 * 100
    assert m["breakeven"]  == 448.80   # 450 - 1.20


def test_compute_option_metrics_bear_call():
    from backend.routers.trades import _compute_option_metrics
    from backend.models import Trade
    t = Trade(
        option_spread_type="bear_call",
        option_long_strike=460.0,
        option_short_strike=455.0,
        entry=1.20,
        shares=1,
    )
    m = _compute_option_metrics(t)
    assert m["max_loss"]   == 380.0    # (5 - 1.20) * 1 * 100
    assert m["max_profit"] == 120.0    # 1.20 * 1 * 100
    assert m["breakeven"]  == 456.20   # 455 + 1.20
