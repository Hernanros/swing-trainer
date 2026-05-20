import pytest
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
    from backend.models import User, SkillScore
    import json
    db = _Session()
    user = User(
        name="Tester",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=json.dumps(["chart_reading", "entry_timing"]),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    for skill in ["chart_reading", "entry_timing"]:
        db.add(SkillScore(user_id=user.id, skill=skill, score=0.0))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved_db:
        app.dependency_overrides[get_db] = saved_db
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_stats_no_trades():
    resp = client.get("/api/progress/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_trades"] == 0
    assert data["closed_trades"] == 0
    assert data["win_rate"] is None
    assert data["avg_r"] is None
    assert data["avg_plan_adherence"] is None
    assert data["total_pnl"] == 0.0


def test_stats_with_closed_trades():
    client.post("/api/trades/", json=VALID_TRADE)
    t2 = client.post("/api/trades/", json=VALID_TRADE).json()
    # Close with a win (exit > entry for long)
    client.put(f"/api/trades/{t2['id']}/close", json={"exit_price": 110.0, "debrief": "Good trade"})

    resp = client.get("/api/progress/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_trades"] == 2
    assert data["closed_trades"] == 1
    assert data["wins"] == 1
    assert data["win_rate"] == 100.0
    assert round(data["avg_r"], 2) == 2.0   # (110-100)/(100-95) = 2.0
    assert data["total_pnl"] == 100.0        # (110-100)*10


def test_stats_plan_adherence():
    body = {**VALID_TRADE, "checklist_score": 80.0}
    resp = client.post("/api/trades/", json=body)
    assert resp.status_code == 201
    stats = client.get("/api/progress/stats").json()
    assert stats["avg_plan_adherence"] == 80.0
