import pytest
from unittest.mock import patch, MagicMock
import backend.auth as auth_module
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import Base, get_db
from backend.auth import require_auth
from backend.models import User, SkillScore

TEST_DB_URL = "sqlite://"
_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def override_get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[require_auth] = lambda: None
auth_module.DEV_BYPASS_AUTH = True


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
    "active_skills": ["chart_reading", "entry_timing"],
}


@pytest.fixture
def user_id():
    resp = client.post("/api/users/", json=VALID_USER)
    assert resp.status_code == 201
    return resp.json()["id"]


def test_daily_tip_passes_context_to_generate(user_id):
    with patch("backend.services.claude.get_user_coaching_context", return_value="CTX") as mock_ctx, \
         patch("backend.services.claude.generate_daily_tip", return_value="tip text") as mock_tip:
        resp = client.get("/api/tips/daily")
    assert resp.status_code == 200
    mock_ctx.assert_called_once()
    mock_tip.assert_called_once()
    args = mock_tip.call_args
    assert args[1].get("context") == "CTX" or (len(args[0]) > 1 and args[0][1] == "CTX")


def test_ask_tip_passes_context_to_generate(user_id):
    with patch("backend.services.claude.get_user_coaching_context", return_value="CTX") as mock_ctx, \
         patch("backend.services.claude.generate_ask_tip", return_value="answer") as mock_ask:
        resp = client.post("/api/tips/ask", json={"question": "What is a good entry?"})
    assert resp.status_code == 200
    mock_ctx.assert_called_once()
    mock_ask.assert_called_once()
    args = mock_ask.call_args
    assert args[1].get("context") == "CTX" or (len(args[0]) > 1 and args[0][1] == "CTX")


def test_generate_daily_tip_uses_system_block_when_context_provided():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(content=[MagicMock(text="tip")])
    with patch("backend.services.claude._api_key", "test-key"), \
         patch("anthropic.Anthropic", return_value=mock_client):
        from backend.services.claude import generate_daily_tip
        generate_daily_tip("chart_reading", context="User: Alice")
    call_kwargs = mock_client.messages.create.call_args[1]
    system = call_kwargs["system"]
    assert isinstance(system, list)
    assert any(block.get("cache_control") == {"type": "ephemeral"} for block in system)
    assert any("Alice" in block.get("text", "") for block in system)


def test_generate_daily_tip_no_context_uses_string_system():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(content=[MagicMock(text="tip")])
    with patch("backend.services.claude._api_key", "test-key"), \
         patch("anthropic.Anthropic", return_value=mock_client):
        from backend.services.claude import generate_daily_tip
        generate_daily_tip("chart_reading")
    call_kwargs = mock_client.messages.create.call_args[1]
    system = call_kwargs["system"]
    assert isinstance(system, str)


def test_generate_ask_tip_uses_system_block_when_context_provided():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(content=[MagicMock(text="answer")])
    with patch("backend.services.claude._api_key", "test-key"), \
         patch("anthropic.Anthropic", return_value=mock_client):
        from backend.services.claude import generate_ask_tip
        generate_ask_tip("What is a breakout?", context="User: Alice")
    call_kwargs = mock_client.messages.create.call_args[1]
    system = call_kwargs["system"]
    assert isinstance(system, list)
    assert any(block.get("cache_control") == {"type": "ephemeral"} for block in system)


def test_generate_ask_tip_no_context_uses_string_system():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(content=[MagicMock(text="answer")])
    with patch("backend.services.claude._api_key", "test-key"), \
         patch("anthropic.Anthropic", return_value=mock_client):
        from backend.services.claude import generate_ask_tip
        generate_ask_tip("What is a breakout?")
    call_kwargs = mock_client.messages.create.call_args[1]
    system = call_kwargs["system"]
    assert isinstance(system, str)
