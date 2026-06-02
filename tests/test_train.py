import pytest
import backend.auth as auth_module
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
from backend.models import User, SkillScore, QuestionMastery
import json
from unittest.mock import patch

TEST_DB_URL = "sqlite://"
_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

auth_module.DEV_BYPASS_AUTH = True


@pytest.fixture(autouse=True)
def reset_db():
    saved = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = lambda: _Session()
    Base.metadata.create_all(bind=_engine)
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


def test_question_mastery_model_defaults():
    db = _Session()
    row = QuestionMastery(user_id=1, drill_key='entry_timing', bank_idx=3)
    db.add(row)
    db.commit()
    db.refresh(row)
    assert row.state == 'new'
    assert row.correct_streak == 0
    assert row.drill_key == 'entry_timing'
    assert row.bank_idx == 3
    db.close()


from backend.routers.train import _apply_mastery_transition


def test_transition_new_correct_becomes_learning():
    state, streak = _apply_mastery_transition('new', 0, True)
    assert state == 'learning'
    assert streak == 1


def test_transition_learning_correct_increments_streak():
    state, streak = _apply_mastery_transition('learning', 1, True)
    assert state == 'learning'
    assert streak == 2


def test_transition_learning_streak_2_correct_becomes_mastered():
    state, streak = _apply_mastery_transition('learning', 2, True)
    assert state == 'mastered'
    assert streak == 3


def test_transition_learning_wrong_becomes_new():
    state, streak = _apply_mastery_transition('learning', 1, False)
    assert state == 'new'
    assert streak == 0


def test_transition_new_wrong_stays_new():
    state, streak = _apply_mastery_transition('new', 0, False)
    assert state == 'new'
    assert streak == 0


def test_get_mastery_empty_with_no_history():
    resp = client.get("/api/train/mastery/entry_timing")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_mastery_invalid_drill_key_returns_400():
    resp = client.get("/api/train/mastery/not_a_drill")
    assert resp.status_code == 400


def test_submit_quiz_with_drill_key_creates_mastery_rows():
    detail = [
        {"q_idx": 0, "bank_idx": 0, "chosen": 1, "answer": 0, "is_correct": False},
        {"q_idx": 1, "bank_idx": 2, "chosen": 2, "answer": 2, "is_correct": True},
    ]
    resp = client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing",
        "drill_type": "quiz",
        "score": 50.0,
        "detail": detail,
        "drill_key": "entry_timing",
    })
    assert resp.status_code == 200

    mastery = client.get("/api/train/mastery/entry_timing").json()
    by_idx = {r["bank_idx"]: r for r in mastery}

    assert by_idx[0]["state"] == "new"
    assert by_idx[0]["correct_streak"] == 0
    assert by_idx[2]["state"] == "learning"
    assert by_idx[2]["correct_streak"] == 1


def test_mastery_advances_to_mastered_after_three_corrects():
    for _ in range(3):
        client.post("/api/train/quiz/submit", json={
            "skill": "entry_timing",
            "drill_type": "quiz",
            "score": 100.0,
            "detail": [{"q_idx": 0, "bank_idx": 5, "chosen": 0, "answer": 0, "is_correct": True}],
            "drill_key": "entry_timing",
        })

    mastery = client.get("/api/train/mastery/entry_timing").json()
    row = next(r for r in mastery if r["bank_idx"] == 5)
    assert row["state"] == "mastered"
    assert row["correct_streak"] == 3


def test_mastery_drops_on_wrong_answer():
    client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing", "drill_type": "quiz", "score": 100.0,
        "detail": [{"q_idx": 0, "bank_idx": 7, "chosen": 0, "answer": 0, "is_correct": True}],
        "drill_key": "entry_timing",
    })
    client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing", "drill_type": "quiz", "score": 0.0,
        "detail": [{"q_idx": 0, "bank_idx": 7, "chosen": 1, "answer": 0, "is_correct": False}],
        "drill_key": "entry_timing",
    })

    mastery = client.get("/api/train/mastery/entry_timing").json()
    row = next(r for r in mastery if r["bank_idx"] == 7)
    assert row["state"] == "new"
    assert row["correct_streak"] == 0


def test_submit_without_drill_key_creates_no_mastery_rows():
    detail = [{"q_idx": 0, "bank_idx": 0, "chosen": 0, "answer": 0, "is_correct": True}]
    client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing", "drill_type": "quiz", "score": 100.0, "detail": detail,
    })
    mastery = client.get("/api/train/mastery/entry_timing").json()
    assert mastery == []


def test_submit_detail_without_bank_idx_is_skipped():
    detail = [{"q_idx": 0, "chosen": 0, "answer": 0, "is_correct": True}]
    client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing", "drill_type": "quiz", "score": 100.0,
        "detail": detail, "drill_key": "entry_timing",
    })
    mastery = client.get("/api/train/mastery/entry_timing").json()
    assert mastery == []


def test_get_all_mastery_returns_by_drill_key():
    client.post("/api/train/quiz/submit", json={
        "skill": "entry_timing", "drill_type": "quiz", "score": 100.0,
        "detail": [{"q_idx": 0, "bank_idx": 1, "chosen": 0, "answer": 0, "is_correct": True}],
        "drill_key": "entry_timing",
    })
    client.post("/api/train/quiz/submit", json={
        "skill": "chart_reading", "drill_type": "pattern_quiz", "score": 100.0,
        "detail": [{"q_idx": 0, "bank_idx": 0, "chosen": 0, "answer": 0, "is_correct": True}],
        "drill_key": "chart_patterns",
    })

    resp = client.get("/api/train/mastery/all")
    assert resp.status_code == 200
    data = resp.json()
    assert "entry_timing" in data
    assert "chart_patterns" in data
    assert data["entry_timing"][0]["bank_idx"] == 1
    assert data["chart_patterns"][0]["bank_idx"] == 0


def test_get_all_mastery_empty_with_no_history():
    resp = client.get("/api/train/mastery/all")
    assert resp.status_code == 200
    assert resp.json() == {}


_MOCK_AI_QUESTIONS = json.dumps([{
    "q": f"Question {i}?",
    "choices": ["A", "B", "C", "D"],
    "answer": 0,
    "explanation": "Because A."
} for i in range(5)])


def test_ai_drill_with_skill_returns_questions():
    with patch("backend.routers.train.call_claude", return_value=_MOCK_AI_QUESTIONS):
        resp = client.post("/api/train/ai-drill", json={
            "topic": "entry timing",
            "context": "How to time entries precisely",
            "skill": "entry_timing",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "questions" in data
    assert len(data["questions"]) == 5


def test_ai_drill_mastery_context_injected_in_prompt():
    db = _Session()
    user = db.query(User).first()
    db.add(QuestionMastery(user_id=user.id, drill_key="entry_timing", bank_idx=0, state="learning", correct_streak=1))
    db.add(QuestionMastery(user_id=user.id, drill_key="entry_timing", bank_idx=1, state="mastered", correct_streak=3))
    db.commit()
    db.close()

    captured = {}

    def _capture(prompt, max_tokens=1000):
        captured["prompt"] = prompt
        return _MOCK_AI_QUESTIONS

    with patch("backend.routers.train.call_claude", side_effect=_capture):
        resp = client.post("/api/train/ai-drill", json={
            "topic": "entry timing",
            "context": "How to time entries precisely",
            "skill": "entry_timing",
        })
    assert resp.status_code == 200
    assert "mastery" in captured["prompt"].lower()
    assert "entry_timing" in captured["prompt"]
