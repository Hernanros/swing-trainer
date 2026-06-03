import pytest
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
auth_module.DEV_BYPASS_AUTH = True  # get_current_user returns first DB user


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

VALID_USER = {
    "name": "Hernan",
    "trading_stage": "small_money",
    "time_budget": "30min",
    "active_skills": ["chart_reading", "entry_timing", "risk_sizing", "setup_selection"],
}


def test_patch_me_updates_name():
    client.post("/api/users/", json=VALID_USER)
    resp = client.patch("/api/users/me", json={"name": "NewName"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "NewName"


def test_patch_me_rejects_duplicate_name():
    client.post("/api/users/", json=VALID_USER)
    client.post("/api/users/", json={**VALID_USER, "name": "OtherUser"})
    # Patch first user (returned by DEV_BYPASS_AUTH first()) to match second user's name
    resp = client.patch("/api/users/me", json={"name": "OtherUser"})
    assert resp.status_code == 409
