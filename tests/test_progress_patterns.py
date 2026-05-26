import json
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
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

VALID_TRADE = {
    "symbol": "AAPL",
    "direction": "long",
    "entry_price": 100.0,
    "stop_price": 95.0,
    "target_price": 115.0,
    "shares": 10,
}


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


def _make_closed_trades(n: int):
    for _ in range(n):
        t = client.post("/api/trades/", json=VALID_TRADE).json()
        client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 110.0, "debrief": "good"})


def _seed_old_pattern(hours_ago: int = 1):
    db = _Session()
    from backend.models import AIPattern, User
    user = db.query(User).first()
    db.add(AIPattern(
        user_id=user.id,
        pattern_text="Old pattern",
        severity="problem",
        detected_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
        trade_range="last 20 trades",
    ))
    db.commit()
    db.close()


def _seed_future_pattern():
    db = _Session()
    from backend.models import AIPattern, User
    user = db.query(User).first()
    db.add(AIPattern(
        user_id=user.id,
        pattern_text="Recent pattern",
        severity="watch",
        detected_at=datetime.now(timezone.utc) + timedelta(hours=1),
        trade_range="last 20 trades",
    ))
    db.commit()
    db.close()


FAKE_PATTERNS = [
    {"severity": "problem", "pattern_text": "Cuts winners early in 8 of 12 trades"},
    {"severity": "watch",   "pattern_text": "Overtrading on Mondays"},
    {"severity": "strength","pattern_text": "No stops violated in last 15 trades"},
]


def test_patterns_returns_empty_when_none_exist():
    resp = client.get("/api/progress/patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert data["patterns"] == []
    assert data["last_analyzed_at"] is None
    assert data["min_trades_met"] is False
    assert data["can_analyze"] is False


def test_patterns_returns_existing_patterns():
    _make_closed_trades(5)
    _seed_future_pattern()
    resp = client.get("/api/progress/patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["patterns"]) == 1
    assert data["patterns"][0]["severity"] == "watch"
    assert data["last_analyzed_at"] is not None
    assert data["min_trades_met"] is True
    assert data["can_analyze"] is False


def test_analyze_requires_5_trades():
    _make_closed_trades(3)
    resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 422


def test_analyze_requires_new_trade():
    _make_closed_trades(5)
    _seed_future_pattern()
    resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 429


def test_analyze_writes_patterns():
    _make_closed_trades(5)
    with patch("backend.routers.progress.generate_pattern_analysis", return_value=FAKE_PATTERNS):
        resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    assert {p["severity"] for p in data} == {"problem", "watch", "strength"}
    assert all("pattern_text" in p for p in data)
    assert all("detected_at" in p for p in data)


def test_analyze_replaces_old_patterns():
    _make_closed_trades(5)
    _seed_old_pattern(hours_ago=1)
    new_patterns = [{"severity": "strength", "pattern_text": "Improved risk management"}]
    with patch("backend.routers.progress.generate_pattern_analysis", return_value=new_patterns):
        resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["pattern_text"] == "Improved risk management"
    get_resp = client.get("/api/progress/patterns")
    assert len(get_resp.json()["patterns"]) == 1


def test_analyze_returns_503_on_claude_failure():
    _make_closed_trades(5)
    with patch("backend.routers.progress.generate_pattern_analysis",
               side_effect=RuntimeError("API down")):
        resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 503
