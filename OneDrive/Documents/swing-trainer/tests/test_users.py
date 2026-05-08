import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
from backend.auth import require_auth

TEST_DB_URL = "sqlite://"  # in-memory, no file on disk
_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,  # required: all connections share same in-memory DB
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def override_get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[require_auth] = lambda: None  # bypass auth in tests


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


client = TestClient(app)

VALID_USER = {
    "name": "Hernan",
    "trading_stage": "small_money",
    "time_budget": "30min",
    "active_skills": ["chart_reading", "entry_timing", "risk_sizing", "setup_selection"],
}


def test_health():
    assert client.get("/health").status_code == 200


def test_create_user_returns_201():
    resp = client.post("/api/users/", json=VALID_USER)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Hernan"
    assert data["active_skills"] == VALID_USER["active_skills"]
    assert "id" in data


def test_create_user_initialises_skill_scores():
    resp = client.post("/api/users/", json=VALID_USER)
    user_id = resp.json()["id"]
    scores_resp = client.get(f"/api/users/{user_id}/skills")
    assert scores_resp.status_code == 200
    scores = scores_resp.json()
    assert len(scores) == 4
    assert all(s["score"] == 0.0 for s in scores)


def test_create_user_invalid_skill():
    body = {**VALID_USER, "active_skills": ["chart_reading", "fake_skill"]}
    assert client.post("/api/users/", json=body).status_code == 400


def test_create_user_too_few_skills():
    body = {**VALID_USER, "active_skills": ["chart_reading"]}
    assert client.post("/api/users/", json=body).status_code == 400


def test_create_user_invalid_stage():
    body = {**VALID_USER, "trading_stage": "expert"}
    assert client.post("/api/users/", json=body).status_code == 400


def test_list_users():
    client.post("/api/users/", json=VALID_USER)
    resp = client.get("/api/users/")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_get_user():
    user_id = client.post("/api/users/", json=VALID_USER).json()["id"]
    resp = client.get(f"/api/users/{user_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Hernan"


def test_get_user_not_found():
    assert client.get("/api/users/999").status_code == 404


def test_update_user_name():
    user_id = client.post("/api/users/", json=VALID_USER).json()["id"]
    resp = client.put(f"/api/users/{user_id}", json={"name": "Hernan R."})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Hernan R."


def test_update_user_invalid_stage():
    user_id = client.post("/api/users/", json=VALID_USER).json()["id"]
    resp = client.put(f"/api/users/{user_id}", json={"trading_stage": "guru"})
    assert resp.status_code == 400


def test_update_user_skills_reconciles_scores():
    user_id = client.post("/api/users/", json=VALID_USER).json()["id"]
    new_skills = ["chart_reading", "trade_management"]
    client.put(f"/api/users/{user_id}", json={"active_skills": new_skills})
    scores = client.get(f"/api/users/{user_id}/skills").json()
    skill_names = {s["skill"] for s in scores}
    assert skill_names == set(new_skills)
