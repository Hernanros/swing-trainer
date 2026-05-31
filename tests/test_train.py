import pytest
import backend.auth as auth_module
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
import json

TEST_DB_URL = "sqlite://"
_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

auth_module.DEV_BYPASS_AUTH = True


@pytest.fixture(autouse=True)
def reset_db():
    saved = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = lambda: _Session()
    Base.metadata.create_all(bind=_engine)
    from backend.models import User, SkillScore
    db = _Session()
    user = User(
        name="T",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=json.dumps(["risk_sizing", "entry_timing"]),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(SkillScore(user_id=user.id, skill="risk_sizing", score=0.0))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved:
        app.dependency_overrides[get_db] = saved
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_today_returns_drills_assigned():
    resp = client.get("/api/train/today")
    assert resp.status_code == 200
    data = resp.json()
    assert data["drills_assigned"] == 2   # 30min → 2
    assert data["drills_completed"] == 0
    assert data["remaining"] == 2


def test_generate_risk_calc_returns_params():
    resp = client.get("/api/train/risk-calc/generate")
    assert resp.status_code == 200
    data = resp.json()
    for key in ("account_size", "risk_pct", "entry", "stop"):
        assert key in data
    assert "correct_shares" not in data
    assert data["entry"] > data["stop"]


def test_submit_exact_answer_scores_100():
    # entry=100, stop=90, risk_pct=1, account_size=10000
    # risk_amount=100, correct=100/(100-90)=10
    resp = client.post("/api/train/risk-calc/submit", json={
        "account_size": 10_000,
        "risk_pct": 1.0,
        "entry": 100.0,
        "stop": 90.0,
        "user_answer": 10,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct_shares"] == 10
    assert data["score"] == 100.0


def test_submit_close_answer_scores_80():
    # correct=10, answer=10 ±5% → answer=10 (exact) but let's do answer=10 which is exact
    # To test 80: use answer that is within 5% but not exact
    # correct=100, answer=104 (4% off) → 80
    resp = client.post("/api/train/risk-calc/submit", json={
        "account_size": 100_000,
        "risk_pct": 1.0,
        "entry": 100.0,
        "stop": 99.0,
        "user_answer": 1040,  # correct=1000, 4% off → 80
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct_shares"] == 1000
    assert data["score"] == 80.0


def test_submit_wrong_answer_scores_0():
    resp = client.post("/api/train/risk-calc/submit", json={
        "account_size": 10_000,
        "risk_pct": 1.0,
        "entry": 100.0,
        "stop": 90.0,
        "user_answer": 999,  # correct=10, wildly wrong
    })
    assert resp.status_code == 200
    assert resp.json()["score"] == 0.0


def test_submit_updates_skill_score():
    client.post("/api/train/risk-calc/submit", json={
        "account_size": 10_000, "risk_pct": 1.0,
        "entry": 100.0, "stop": 90.0, "user_answer": 10,
    })
    resp = client.get("/api/users/1/skills")
    assert resp.status_code == 200
    skills = {s["skill"]: s["score"] for s in resp.json()}
    assert skills["risk_sizing"] > 0.0


def test_today_counts_completed_drills():
    client.post("/api/train/risk-calc/submit", json={
        "account_size": 10_000, "risk_pct": 1.0,
        "entry": 100.0, "stop": 90.0, "user_answer": 10,
    })
    resp = client.get("/api/train/today")
    assert resp.json()["drills_completed"] == 1
    assert resp.json()["remaining"] == 1


def test_question_weights_empty_with_no_history():
    resp = client.get("/api/train/question-weights/risk_sizing")
    assert resp.status_code == 200
    assert resp.json() == {"weights": {}}


def test_question_weights_accumulates_from_detail_json():
    # submit a quiz where bank_idx=0 was answered wrong and bank_idx=1 was correct
    detail = [
        {"q_idx": 0, "bank_idx": 0, "chosen": 1, "answer": 0, "is_correct": False},
        {"q_idx": 1, "bank_idx": 1, "chosen": 2, "answer": 2, "is_correct": True},
    ]
    client.post("/api/train/quiz/submit", json={
        "skill": "risk_sizing", "drill_type": "quiz", "score": 50.0, "detail": detail,
    })
    resp = client.get("/api/train/question-weights/risk_sizing")
    assert resp.status_code == 200
    weights = resp.json()["weights"]
    # bank_idx 0 was wrong → high weight (1.0 - 0.0 = 1.0, capped at 1.0)
    assert weights["0"] == pytest.approx(1.0, abs=0.01)
    # bank_idx 1 was correct → low weight (max(0.2, 1.0 - 1.0) = 0.2)
    assert weights["1"] == pytest.approx(0.2, abs=0.01)


def test_question_weights_rejects_invalid_skill():
    resp = client.get("/api/train/question-weights/not_a_skill")
    assert resp.status_code == 400


def test_question_weights_ignores_missing_bank_idx():
    # detail items without bank_idx should be skipped silently
    detail = [{"q_idx": 0, "chosen": 1, "answer": 0, "is_correct": False}]
    client.post("/api/train/quiz/submit", json={
        "skill": "risk_sizing", "drill_type": "quiz", "score": 0.0, "detail": detail,
    })
    resp = client.get("/api/train/question-weights/risk_sizing")
    assert resp.status_code == 200
    assert resp.json()["weights"] == {}
