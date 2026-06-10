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


VALID_SPREAD = {
    "symbol":               "SPY",
    "trade_type":           "option_spread",
    "option_spread_type":   "bull_call",
    "option_expiry":        "2026-07-18",
    "option_long_strike":   450.0,
    "option_short_strike":  455.0,
    "entry_price":          1.50,
    "stop_price":           0.75,
    "target_price":         3.00,
    "shares":               2,
}


def test_open_option_spread_returns_computed_fields():
    resp = client.post("/api/trades/", json=VALID_SPREAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["trade_type"]         == "option_spread"
    assert data["option_spread_type"] == "bull_call"
    assert data["option_expiry"]      == "2026-07-18"
    assert data["option_long_strike"] == 450.0
    assert data["option_short_strike"] == 455.0
    assert data["max_loss"]           == 300.0
    assert data["max_profit"]         == 700.0
    assert data["breakeven"]          == 451.50
    assert data["direction"]          == "long"


def test_open_option_spread_missing_expiry_returns_400():
    body = {**VALID_SPREAD, "option_expiry": None}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 400


def test_open_option_spread_missing_spread_type_returns_400():
    body = {**VALID_SPREAD, "option_spread_type": None}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 400


def test_open_option_spread_equal_strikes_returns_400():
    body = {**VALID_SPREAD, "option_short_strike": 450.0}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 400


def _open_spread(body=None):
    resp = client.post("/api/trades/", json=body or VALID_SPREAD)
    assert resp.status_code == 201, f"open_spread failed: {resp.json()}"
    return resp.json()


def test_close_debit_spread_profit_pnl():
    t = _open_spread()
    resp = client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 3.00, "debrief": "good trade"})
    assert resp.status_code == 200
    data = resp.json()
    # pnl = (3.00 - 1.50) * 2 * 100 = 300
    assert data["pnl"] == 300.0
    assert data["status"] == "closed"


def test_close_debit_spread_loss_pnl():
    t = _open_spread()
    resp = client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 0.50, "debrief": "stopped out"})
    assert resp.status_code == 200
    data = resp.json()
    # pnl = (0.50 - 1.50) * 2 * 100 = -200
    assert data["pnl"] == -200.0


def test_close_credit_spread_profit_pnl():
    body = {
        **VALID_SPREAD,
        "option_spread_type":  "bull_put",
        "option_long_strike":  445.0,
        "option_short_strike": 450.0,
        "entry_price":         1.20,
        "stop_price":          2.40,
        "target_price":        0.30,
        "shares":              1,
    }
    t = _open_spread(body)
    # exit at 0.30 (near worthless) = profit for credit spread
    resp = client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 0.30, "debrief": "expired profitable"})
    assert resp.status_code == 200
    data = resp.json()
    # pnl = (1.20 - 0.30) * 1 * 100 = 90
    assert data["pnl"] == 90.0


def test_close_option_spread_r_multiple():
    t = _open_spread()
    resp = client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 3.00, "debrief": "good"})
    assert resp.status_code == 200
    data = resp.json()
    # pnl=300, max_loss = 1.50*2*100 = 300 → r_multiple = 1.0
    assert data["r_multiple"] == 1.0


# ── Task 1: pre_trade_advisory column, migration, schema ─────────────────────

def test_trade_model_has_pre_trade_advisory_column():
    with _engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(trades)"))]
    assert "pre_trade_advisory" in cols, "Missing column: pre_trade_advisory"


def test_trade_create_accepts_pre_trade_advisory():
    from backend.schemas import TradeCreate
    t = TradeCreate(
        symbol="SPY",
        entry_price=1.5,
        stop_price=0,
        target_price=3,
        shares=1,
        trade_type="option_spread",
        option_spread_type="bull_put",
        option_long_strike=440,
        option_short_strike=445,
        option_expiry="2026-07-18",
        pre_trade_advisory="hello",
    )
    assert t.pre_trade_advisory == "hello"


def test_trade_create_defaults_pre_trade_advisory_to_none():
    from backend.schemas import TradeCreate
    t = TradeCreate(
        symbol="SPY",
        entry_price=1.5,
        stop_price=0,
        target_price=3,
        shares=1,
    )
    assert t.pre_trade_advisory is None
