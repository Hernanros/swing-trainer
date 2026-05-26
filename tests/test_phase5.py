import json
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

REAL_TRADE = {
    "symbol": "AAPL",
    "direction": "long",
    "entry_price": 100.0,
    "stop_price": 95.0,
    "target_price": 115.0,
    "shares": 10,
    "practice": False,
}

PRACTICE_TRADE = {**REAL_TRADE, "practice": True}


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


def _open_and_close(trade_body: dict):
    t = client.post("/api/trades/", json=trade_body).json()
    client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 110.0, "debrief": "ok"})


def test_stats_excludes_practice_trades():
    _open_and_close(REAL_TRADE)
    _open_and_close(PRACTICE_TRADE)
    resp = client.get("/api/progress/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_trades"] == 1
    assert data["closed_trades"] == 1


def test_patterns_gate_excludes_practice_trades():
    # 4 real + 2 practice = only 4 real → min_trades_met should be False
    for _ in range(4):
        _open_and_close(REAL_TRADE)
    for _ in range(2):
        _open_and_close(PRACTICE_TRADE)
    resp = client.get("/api/progress/patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert data["min_trades_met"] is False
    assert data["can_analyze"] is False


def test_analyze_excludes_practice_trades():
    # 3 real + 3 practice = only 3 real → 422
    for _ in range(3):
        _open_and_close(REAL_TRADE)
    for _ in range(3):
        _open_and_close(PRACTICE_TRADE)
    resp = client.post("/api/progress/analyze-patterns")
    assert resp.status_code == 422


def test_quiz_submit_stores_detail_json():
    detail = [
        {"q_idx": 0, "chosen": 1, "answer": 2, "is_correct": False},
        {"q_idx": 1, "chosen": 0, "answer": 0, "is_correct": True},
    ]
    resp = client.post("/api/train/quiz/submit", json={
        "skill": "chart_reading",
        "drill_type": "quiz",
        "score": 50.0,
        "detail": detail,
    })
    assert resp.status_code == 200

    db = _Session()
    from backend.models import DrillResult
    row = db.query(DrillResult).first()
    db.close()
    assert row is not None
    assert row.detail_json is not None
    stored = json.loads(row.detail_json)
    assert stored == detail


def test_quiz_submit_without_detail():
    resp = client.post("/api/train/quiz/submit", json={
        "skill": "chart_reading",
        "drill_type": "quiz",
        "score": 80.0,
    })
    assert resp.status_code == 200

    db = _Session()
    from backend.models import DrillResult
    row = db.query(DrillResult).first()
    db.close()
    assert row is not None
    assert row.detail_json is None
