import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from datetime import datetime, timezone

from backend.main import app
from backend.database import Base, get_db
from backend.models import AccessRequest
import backend.auth as auth_module

_ADMIN_DB_URL = "sqlite:///file:admin_test?mode=memory&cache=shared&uri=true"
_engine = create_engine(
    _ADMIN_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _override_get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def reset_db(monkeypatch):
    monkeypatch.setattr(auth_module, "DEV_BYPASS_AUTH", True)
    # Save whatever override was in place (other test modules may have set one)
    _previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = _override_get_db
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)
    # Restore the previous override (or remove ours if there was none)
    if _previous_override is not None:
        app.dependency_overrides[get_db] = _previous_override
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def _make_request(email, status, name=None):
    db = _Session()
    req = AccessRequest(
        email=email,
        name=name,
        status=status,
        requested_at=datetime.now(timezone.utc),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    req_id = req.id
    db.close()
    return req_id


def test_get_requests_returns_grouped_results():
    _make_request("pending@test.com", "pending", name="Pending User")
    _make_request("approved@test.com", "approved", name="Approved User")

    resp = client.get("/api/admin/requests")
    assert resp.status_code == 200
    data = resp.json()

    assert "pending" in data
    assert "approved" in data
    assert "rejected" in data

    pending_emails = [r["email"] for r in data["pending"]]
    approved_emails = [r["email"] for r in data["approved"]]
    assert "pending@test.com" in pending_emails
    assert "approved@test.com" in approved_emails


def test_approve_sets_status_and_reviewed_at():
    req_id = _make_request("user@test.com", "pending")

    with patch("backend.routers.admin.send_approval_notification"):
        resp = client.post(f"/api/admin/requests/{req_id}/approve")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "approved"
    assert data["reviewed_at"] is not None


def test_reject_sets_status_and_reviewed_at():
    req_id = _make_request("user2@test.com", "pending")

    resp = client.post(f"/api/admin/requests/{req_id}/reject")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "rejected"
    assert data["reviewed_at"] is not None


def test_approve_404_for_missing_id():
    with patch("backend.routers.admin.send_approval_notification"):
        resp = client.post("/api/admin/requests/9999/approve")
    assert resp.status_code == 404


def test_approve_calls_email_notification():
    req_id = _make_request("notify@test.com", "pending")

    with patch("backend.routers.admin.send_approval_notification") as mock_send:
        resp = client.post(f"/api/admin/requests/{req_id}/approve")

    assert resp.status_code == 200
    mock_send.assert_called_once_with("notify@test.com")
