import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app, lifespan
from backend.database import Base, get_db
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
    db = _Session()
    from backend.models import User
    user = User(
        name="Tester",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=json.dumps(["chart_reading"]),
        email="test@example.com",
    )
    db.add(user)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=_engine)
    if saved_db:
        app.dependency_overrides[get_db] = saved_db
    else:
        app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def test_trade_model_has_option_columns():
    with _engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(trades)"))]
    for col in ["trade_type", "option_expiry", "option_long_strike", "option_short_strike", "option_spread_type"]:
        assert col in cols, f"Missing column: {col}"
