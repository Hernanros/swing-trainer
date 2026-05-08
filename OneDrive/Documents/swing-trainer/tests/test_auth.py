import pytest
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


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[require_auth] = lambda: None


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


client = TestClient(app)


def test_health_needs_no_auth():
    assert client.get("/health").status_code == 200


def test_forbidden_returns_403():
    resp = client.get("/auth/forbidden")
    assert resp.status_code == 403
    assert "denied" in resp.json()["error"].lower()


def test_logout_redirects():
    resp = client.get("/auth/logout", follow_redirects=False)
    assert resp.status_code in (302, 307)


def test_api_returns_401_without_session(monkeypatch):
    import backend.auth as auth_module
    monkeypatch.setattr(auth_module, "DEV_BYPASS_AUTH", False)
    saved = app.dependency_overrides.pop(require_auth, None)
    try:
        resp = client.get("/api/users/")
        assert resp.status_code == 401
    finally:
        if saved is not None:
            app.dependency_overrides[require_auth] = saved
