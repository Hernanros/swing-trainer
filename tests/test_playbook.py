import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
from backend.auth import require_auth
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

RULE = {"setup_type": "breakout", "text": "EMA 20 trending up", "tier": "must", "position": 0}


def test_list_rules_empty():
    resp = client.get("/api/playbook/rules")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_rule_returns_201():
    resp = client.post("/api/playbook/rules", json=RULE)
    assert resp.status_code == 201
    data = resp.json()
    assert data["text"] == RULE["text"]
    assert data["tier"] == "must"
    assert data["active"] is True
    assert "id" in data


def test_create_rule_invalid_tier():
    resp = client.post("/api/playbook/rules", json={**RULE, "tier": "nice_to_have"})
    assert resp.status_code == 400


def test_list_setups_after_create():
    client.post("/api/playbook/rules", json=RULE)
    client.post("/api/playbook/rules", json={**RULE, "setup_type": "pullback", "tier": "should"})
    resp = client.get("/api/playbook/setups")
    assert resp.status_code == 200
    setups = resp.json()
    assert set(setups) == {"breakout", "pullback"}


def test_filter_rules_by_setup():
    client.post("/api/playbook/rules", json=RULE)
    client.post("/api/playbook/rules", json={**RULE, "setup_type": "pullback"})
    resp = client.get("/api/playbook/rules?setup_type=breakout")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["setup_type"] == "breakout"


def test_update_rule():
    rule_id = client.post("/api/playbook/rules", json=RULE).json()["id"]
    resp = client.put(f"/api/playbook/rules/{rule_id}", json={"text": "Updated rule text"})
    assert resp.status_code == 200
    assert resp.json()["text"] == "Updated rule text"


def test_update_rule_invalid_tier():
    rule_id = client.post("/api/playbook/rules", json=RULE).json()["id"]
    resp = client.put(f"/api/playbook/rules/{rule_id}", json={"tier": "bad"})
    assert resp.status_code == 400


def test_delete_rule():
    rule_id = client.post("/api/playbook/rules", json=RULE).json()["id"]
    assert client.delete(f"/api/playbook/rules/{rule_id}").status_code == 204
    resp = client.get("/api/playbook/rules")
    assert resp.json() == []


def test_delete_nonexistent_rule():
    assert client.delete("/api/playbook/rules/999").status_code == 404
