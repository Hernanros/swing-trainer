import pytest
import backend.auth as auth_module
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.database import get_db
from backend.auth import require_auth
from backend.models import Base, User, Trade, BullProfile

SQLALCHEMY_DATABASE_URL = "sqlite://"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[require_auth] = lambda: None
auth_module.DEV_BYPASS_AUTH = True  # get_current_user falls back to first DB user


@pytest.fixture(autouse=True)
def setup():
    prior = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    user = User(
        email="test@test.com",
        name="Test",
        trading_stage="learning",
        time_budget="30min",
        active_skills='["chart_reading"]',
    )
    db.add(user)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)
    if prior is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = prior


client = TestClient(app)


def test_get_paper_account_creates_default_when_no_profile():
    resp = client.get("/api/paper-account")
    assert resp.status_code == 200
    data = resp.json()
    assert data["starting_balance"] == 10000.0
    assert data["realized_pnl"] == 0.0
    assert data["current_balance"] == 10000.0
    assert data["capital_deployed"] == 0.0
    assert data["cash_available"] == 10000.0
    assert data["pct_at_risk"] == 0.0
    assert data["open_spread_count"] == 0
    assert data["closed_trade_count"] == 0


def test_get_paper_account_seeds_from_bull_profile():
    db = TestingSessionLocal()
    user = db.query(User).first()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    db.add(BullProfile(user_id=user.id, account_size=25000.0, risk_per_trade_pct=1.0, max_contracts=5, updated_at=now))
    db.commit()
    db.close()

    resp = client.get("/api/paper-account")
    assert resp.status_code == 200
    assert resp.json()["starting_balance"] == 25000.0


def test_get_paper_account_sums_realized_pnl():
    db = TestingSessionLocal()
    user = db.query(User).first()
    from datetime import date
    db.add(Trade(user_id=user.id, symbol="AAPL", trade_type="equity", entry=100.0,
                 stop=95.0, target=110.0, shares=10, direction="long",
                 status="closed", practice=True, pnl=500.0, date=date.today().isoformat(),
                 trade_date=date.today().isoformat()))
    db.add(Trade(user_id=user.id, symbol="MSFT", trade_type="equity", entry=200.0,
                 stop=190.0, target=220.0, shares=10, direction="long",
                 status="closed", practice=True, pnl=-200.0, date=date.today().isoformat(),
                 trade_date=date.today().isoformat()))
    db.commit()
    db.close()

    resp = client.get("/api/paper-account")
    data = resp.json()
    assert data["realized_pnl"] == 300.0
    assert data["current_balance"] == 10300.0
    assert data["closed_trade_count"] == 2


def test_get_paper_account_computes_capital_deployed():
    db = TestingSessionLocal()
    user = db.query(User).first()
    from datetime import date
    # bull put spread: short=50, long=45, premium=1.50, shares(=contracts)=2
    # max_loss = (50-45-1.50)*100*2 = 3.50*100*2 = 700
    db.add(Trade(
        user_id=user.id, symbol="SPY", trade_type="option_spread",
        option_spread_type="bull_put_spread", entry=1.50,
        option_short_strike=50.0, option_long_strike=45.0, shares=2,
        stop=0.0, target=0.0, direction="long",
        status="open", practice=True, date=date.today().isoformat(),
        trade_date=date.today().isoformat()
    ))
    db.commit()
    db.close()

    resp = client.get("/api/paper-account")
    data = resp.json()
    assert data["capital_deployed"] == 700.0
    assert data["open_spread_count"] == 1
    assert data["cash_available"] == 10000.0 - 700.0
    assert data["pct_at_risk"] == 7.0


def test_get_paper_account_ignores_real_trades():
    db = TestingSessionLocal()
    user = db.query(User).first()
    from datetime import date
    db.add(Trade(user_id=user.id, symbol="AAPL", trade_type="equity", entry=100.0,
                 stop=95.0, target=110.0, shares=10, direction="long",
                 status="closed", practice=False, pnl=1000.0,
                 date=date.today().isoformat(), trade_date=date.today().isoformat()))
    db.commit()
    db.close()

    resp = client.get("/api/paper-account")
    assert resp.json()["realized_pnl"] == 0.0


def test_put_balance_updates_starting_balance():
    resp = client.put("/api/paper-account/balance", json={"starting_balance": 50000.0})
    assert resp.status_code == 200
    assert resp.json()["starting_balance"] == 50000.0

    resp2 = client.get("/api/paper-account")
    assert resp2.json()["starting_balance"] == 50000.0


def test_put_balance_rejects_zero_or_negative():
    assert client.put("/api/paper-account/balance", json={"starting_balance": 0.0}).status_code == 422
    assert client.put("/api/paper-account/balance", json={"starting_balance": -100.0}).status_code == 422


def test_get_paper_account_computes_capital_deployed_debit_spread():
    db = TestingSessionLocal()
    user = db.query(User).first()
    from datetime import date
    # bull call spread (debit): entry=2.00, shares(=contracts)=3
    # max_loss = entry * 100 * contracts = 2.00 * 100 * 3 = 600
    db.add(Trade(
        user_id=user.id, symbol="QQQ", trade_type="option_spread",
        option_spread_type="bull_call", entry=2.00,
        option_short_strike=410.0, option_long_strike=405.0, shares=3,
        stop=0.0, target=0.0, direction="long",
        status="open", practice=True, date=date.today().isoformat(),
        trade_date=date.today().isoformat()
    ))
    db.commit()
    db.close()

    resp = client.get("/api/paper-account")
    data = resp.json()
    assert data["capital_deployed"] == 600.0
    assert data["open_spread_count"] == 1
