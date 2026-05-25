import pytest
from unittest.mock import patch
import backend.auth as auth_module
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
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
auth_module.DEV_BYPASS_AUTH = True  # get_current_user falls back to first DB user


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


def test_trade_date_column_exists():
    from sqlalchemy import inspect
    inspector = inspect(_engine)
    cols = {c["name"] for c in inspector.get_columns("trades")}
    assert "trade_date" in cols, "trade_date column missing from trades table"


VALID_USER = {
    "name": "Hernan",
    "trading_stage": "small_money",
    "time_budget": "30min",
    "active_skills": ["chart_reading", "entry_timing", "risk_sizing", "setup_selection"],
}

VALID_LONG = {
    "symbol": "NVDA",
    "direction": "long",
    "entry_price": 900.0,
    "stop_price": 885.0,
    "target_price": 940.0,
    "shares": 10,
}

VALID_SHORT = {
    "symbol": "SPY",
    "direction": "short",
    "entry_price": 500.0,
    "stop_price": 510.0,
    "target_price": 480.0,
    "shares": 5,
}


@pytest.fixture
def user_id():
    resp = client.post("/api/users/", json=VALID_USER)
    assert resp.status_code == 201
    return resp.json()["id"]


def test_list_trades_empty(user_id):
    resp = client.get("/api/trades/")
    assert resp.status_code == 200
    assert resp.json() == []


def test_open_trade_returns_201(user_id):
    resp = client.post("/api/trades/", json=VALID_LONG)
    assert resp.status_code == 201
    data = resp.json()
    assert data["symbol"] == "NVDA"
    assert data["direction"] == "long"
    assert data["status"] == "open"
    assert data["entry_price"] == 900.0
    assert data["exit_price"] is None
    assert data["pnl"] is None
    assert data["r_multiple"] is None


def test_open_trade_appears_in_list(user_id):
    client.post("/api/trades/", json=VALID_LONG)
    trades = client.get("/api/trades/").json()
    assert len(trades) == 1
    assert trades[0]["symbol"] == "NVDA"
    assert trades[0]["status"] == "open"


def test_open_trade_symbol_uppercased(user_id):
    body = {**VALID_LONG, "symbol": "nvda"}
    resp = client.post("/api/trades/", json=body)
    assert resp.json()["symbol"] == "NVDA"


def test_open_trade_invalid_direction(user_id):
    body = {**VALID_LONG, "direction": "buy"}
    assert client.post("/api/trades/", json=body).status_code == 400


def test_open_trade_entry_equals_stop_rejected(user_id):
    body = {**VALID_LONG, "stop_price": 900.0}
    assert client.post("/api/trades/", json=body).status_code == 400


def test_open_trade_zero_shares_rejected(user_id):
    body = {**VALID_LONG, "shares": 0}
    assert client.post("/api/trades/", json=body).status_code == 400


def test_close_long_trade_calculates_pnl_and_r(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    # entry=900, stop=885, exit=930 → pnl=(930-900)*10=300, r=(930-900)/(900-885)=2.0
    resp = client.put(f"/api/trades/{trade_id}/close", json={
        "exit_price": 930.0,
        "debrief": "Held through noise, exit on target.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "closed"
    assert data["exit_price"] == 930.0
    assert data["pnl"] == 300.0
    assert data["r_multiple"] == 2.0


def test_close_short_trade_calculates_pnl_and_r(user_id):
    trade_id = client.post("/api/trades/", json=VALID_SHORT).json()["id"]
    # entry=500, stop=510, exit=480 → pnl=(500-480)*5=100, r=(500-480)/(510-500)=2.0
    resp = client.put(f"/api/trades/{trade_id}/close", json={
        "exit_price": 480.0,
        "debrief": "Short worked perfectly.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["pnl"] == 100.0
    assert data["r_multiple"] == 2.0


def test_close_losing_long_trade_negative_pnl(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    # entry=900, stop=885, exit=885 → pnl=(885-900)*10=-150, r=(885-900)/(900-885)=-1.0
    resp = client.put(f"/api/trades/{trade_id}/close", json={
        "exit_price": 885.0,
        "debrief": "Stopped out.",
    })
    assert resp.status_code == 200
    assert resp.json()["pnl"] == -150.0
    assert resp.json()["r_multiple"] == -1.0


def test_close_requires_debrief(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    resp = client.put(f"/api/trades/{trade_id}/close", json={
        "exit_price": 930.0,
        "debrief": "   ",  # whitespace only
    })
    assert resp.status_code == 400


def test_close_already_closed_returns_400(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    close_body = {"exit_price": 930.0, "debrief": "Done."}
    client.put(f"/api/trades/{trade_id}/close", json=close_body)
    resp = client.put(f"/api/trades/{trade_id}/close", json=close_body)
    assert resp.status_code == 400


def test_close_other_users_trade_returns_404(user_id):
    # Trade 9999 doesn't exist → 404
    resp = client.put("/api/trades/9999/close", json={"exit_price": 930.0, "debrief": "x"})
    assert resp.status_code == 404


def test_list_trades_newest_first(user_id):
    client.post("/api/trades/", json=VALID_LONG)
    client.post("/api/trades/", json=VALID_SHORT)
    trades = client.get("/api/trades/").json()
    assert trades[0]["symbol"] == "SPY"   # most recent first
    assert trades[1]["symbol"] == "NVDA"


def test_open_trade_with_setup_and_checklist(user_id):
    body = {
        **VALID_LONG,
        "setup_type": "breakout",
        "practice": False,
        "checklist_score": 75.0,
    }
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["setup_type"] == "breakout"
    assert data["practice"] is False
    assert data["checklist_score"] == 75.0


def test_open_trade_practice_flag(user_id):
    body = {**VALID_LONG, "practice": True}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 201
    assert resp.json()["practice"] is True


def test_ai_debrief_requires_closed_trade(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    resp = client.post(f"/api/trades/{trade_id}/ai-debrief")
    assert resp.status_code == 400


def test_ai_debrief_stores_result(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    client.put(f"/api/trades/{trade_id}/close", json={"exit_price": 930.0, "debrief": "Good trade."})
    with patch("backend.services.claude.generate_trade_debrief", return_value="AI analysis here."):
        resp = client.post(f"/api/trades/{trade_id}/ai-debrief")
    assert resp.status_code == 200
    assert resp.json()["ai_debrief"] == "AI analysis here."


def test_close_trade_schedules_background_debrief(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    with patch("backend.routers.trades._generate_debrief_bg") as mock_bg:
        client.put(f"/api/trades/{trade_id}/close", json={
            "exit_price": 930.0,
            "debrief": "Held to target.",
        })
    mock_bg.assert_called_once_with(trade_id)


def test_generate_debrief_bg_writes_ai_debrief(user_id):
    from backend.routers.trades import _generate_debrief_bg
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    client.put(f"/api/trades/{trade_id}/close", json={
        "exit_price": 930.0,
        "debrief": "Good trade.",
    })
    # Patch SessionLocal to use the test DB session
    with patch("backend.routers.trades.SessionLocal", side_effect=_Session), \
         patch("backend.services.claude.generate_trade_debrief", return_value="AI result"):
        _generate_debrief_bg(trade_id)
    trade = client.get("/api/trades/").json()[0]
    assert trade["ai_debrief"] == "AI result"


def test_open_trade_with_trade_date_stores_it(user_id):
    body = {**VALID_LONG, "trade_date": "2026-01-15"}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 201
    assert resp.json()["trade_date"] == "2026-01-15"


def test_open_trade_without_trade_date_falls_back_to_date(user_id):
    resp = client.post("/api/trades/", json=VALID_LONG)
    assert resp.status_code == 201
    data = resp.json()
    # trade_date should be set to today's date string (YYYY-MM-DD format)
    assert data["trade_date"] is not None
    assert len(data["trade_date"]) == 10  # YYYY-MM-DD
