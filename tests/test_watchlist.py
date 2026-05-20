import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
import backend.auth as auth_module

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
    import json
    db = _Session()
    user = User(name="T", trading_stage="small_money", time_budget="30min",
                active_skills=json.dumps(["risk_sizing", "entry_timing"]))
    db.add(user)
    db.commit()
    db.refresh(user)
    for skill in ["risk_sizing", "entry_timing"]:
        db.add(SkillScore(user_id=user.id, skill=skill, score=0.0))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved:
        app.dependency_overrides[get_db] = saved
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_watchlist_empty():
    resp = client.get("/api/watchlist/")
    assert resp.status_code == 200
    assert resp.json() == []


def test_add_symbol():
    resp = client.post("/api/watchlist/", json={"symbol": "nvda", "notes": "watching breakout"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["symbol"] == "NVDA"
    assert data["notes"] == "watching breakout"
    assert "id" in data


def test_add_duplicate_rejected():
    client.post("/api/watchlist/", json={"symbol": "AAPL"})
    resp = client.post("/api/watchlist/", json={"symbol": "aapl"})
    assert resp.status_code == 409


def test_delete_item():
    item_id = client.post("/api/watchlist/", json={"symbol": "MSFT"}).json()["id"]
    assert client.delete(f"/api/watchlist/{item_id}").status_code == 204
    assert client.get("/api/watchlist/").json() == []


def test_delete_nonexistent():
    assert client.delete("/api/watchlist/999").status_code == 404


def test_update_notes():
    item_id = client.post("/api/watchlist/", json={"symbol": "TSLA"}).json()["id"]
    resp = client.put(f"/api/watchlist/{item_id}/notes", json={"notes": "updated note"})
    assert resp.status_code == 200
    assert resp.json()["notes"] == "updated note"
