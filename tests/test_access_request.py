import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.database import Base
from backend.models import AccessRequest

TEST_DB_URL = "sqlite://"
_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


def test_access_request_defaults_to_pending():
    db = _Session()
    req = AccessRequest(email="test@example.com", name="Test User",
                        requested_at=datetime.now(timezone.utc))
    db.add(req)
    db.commit()
    db.refresh(req)
    assert req.id is not None
    assert req.status == "pending"
    assert req.reviewed_at is None
    db.close()


def test_email_service_is_noop_without_config(monkeypatch):
    import backend.services.email as email_svc
    monkeypatch.setattr(email_svc, "GMAIL_USER", "")
    monkeypatch.setattr(email_svc, "GMAIL_APP_PASSWORD", "")
    # must not raise
    email_svc.send_access_request_notification("user@example.com", "User")
    email_svc.send_approval_notification("user@example.com")
