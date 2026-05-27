import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
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

OPEN_TRADE = {
    "symbol": "AAPL",
    "direction": "long",
    "entry_price": 100.0,
    "stop_price": 95.0,
    "target_price": 115.0,
    "shares": 10,
    "practice": False,
    "setup_type": "breakout",
}


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


def _create_rule(text="Volume above avg", tier="must"):
    r = client.post("/api/playbook/rules", json={
        "setup_type": "breakout", "text": text, "tier": tier, "position": 0,
    })
    assert r.status_code == 201
    return r.json()


def _open_trade(setup_type="breakout"):
    t = client.post("/api/trades/", json={**OPEN_TRADE, "setup_type": setup_type})
    assert t.status_code == 201
    return t.json()


def _close_trade(trade_id, checklist_items=None):
    body = {"exit_price": 110.0, "debrief": "Good trade."}
    if checklist_items is not None:
        body["checklist_items"] = checklist_items
    r = client.put(f"/api/trades/{trade_id}/close", json=body)
    assert r.status_code == 200
    return r.json()


def test_close_trade_writes_checklist_logs():
    rule = _create_rule()
    trade = _open_trade()
    _close_trade(trade["id"], [{"rule_id": rule["id"], "checked": True, "tier": "must"}])
    db = _Session()
    from backend.models import ChecklistLog
    logs = db.query(ChecklistLog).all()
    db.close()
    assert len(logs) == 1
    assert logs[0].rule_id == rule["id"]
    assert logs[0].checked is True


def test_close_trade_computes_checklist_score():
    rule1 = _create_rule(text="Rule 1", tier="must")
    rule2 = _create_rule(text="Rule 2", tier="must")
    trade = _open_trade()
    result = _close_trade(trade["id"], [
        {"rule_id": rule1["id"], "checked": True,  "tier": "must"},
        {"rule_id": rule2["id"], "checked": False, "tier": "must"},
    ])
    assert result["checklist_score"] == 50.0


def test_close_trade_no_checklist_leaves_score_null():
    trade = _open_trade()
    result = _close_trade(trade["id"])  # no checklist_items key
    assert result["checklist_score"] is None


def test_setup_stats_groups_by_setup_type():
    t1 = client.post("/api/trades/", json={**OPEN_TRADE, "setup_type": "breakout"}).json()
    client.put(f"/api/trades/{t1['id']}/close", json={"exit_price": 110.0, "debrief": "win"})
    t2 = client.post("/api/trades/", json={**OPEN_TRADE, "setup_type": "breakout"}).json()
    client.put(f"/api/trades/{t2['id']}/close", json={"exit_price": 90.0, "debrief": "loss"})
    t3 = client.post("/api/trades/", json={**OPEN_TRADE, "setup_type": "pullback"}).json()
    client.put(f"/api/trades/{t3['id']}/close", json={"exit_price": 110.0, "debrief": "win"})

    r = client.get("/api/progress/setups")
    assert r.status_code == 200
    data = {s["setup_type"]: s for s in r.json()}
    assert data["breakout"]["trades"] == 2
    assert data["breakout"]["wins"] == 1
    assert data["breakout"]["win_rate"] == 50.0
    assert data["pullback"]["trades"] == 1
    assert data["pullback"]["wins"] == 1
    assert data["pullback"]["win_rate"] == 100.0


def test_setup_stats_excludes_practice():
    t1 = client.post("/api/trades/", json={**OPEN_TRADE, "setup_type": "breakout"}).json()
    client.put(f"/api/trades/{t1['id']}/close", json={"exit_price": 110.0, "debrief": "x"})
    t2 = client.post("/api/trades/", json={**OPEN_TRADE, "setup_type": "breakout", "practice": True}).json()
    client.put(f"/api/trades/{t2['id']}/close", json={"exit_price": 110.0, "debrief": "x"})

    r = client.get("/api/progress/setups")
    data = {s["setup_type"]: s for s in r.json()}
    assert data["breakout"]["trades"] == 1


def test_setup_stats_excludes_null_setup_type():
    trade_no_setup = {k: v for k, v in OPEN_TRADE.items() if k != "setup_type"}
    t = client.post("/api/trades/", json=trade_no_setup).json()
    client.put(f"/api/trades/{t['id']}/close", json={"exit_price": 110.0, "debrief": "x"})

    r = client.get("/api/progress/setups")
    assert r.status_code == 200
    assert r.json() == []
