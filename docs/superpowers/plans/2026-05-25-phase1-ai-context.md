# Phase 1 — AI with User Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tips, Ask, and Debrief know who the user is — inject real trade history and skill scores into every AI call.

**Architecture:** Add `get_user_coaching_context(user, db)` to `claude.py` that returns a text block of trade history + skill scores; pass it as a cached Anthropic system block in `generate_daily_tip` and `generate_ask_tip`; auto-trigger debrief generation as a FastAPI BackgroundTask when a trade is closed.

**Tech Stack:** FastAPI BackgroundTasks, Anthropic SDK prompt caching (`cache_control: {"type": "ephemeral"}`), SQLAlchemy, pytest + unittest.mock

---

## File Map

| File | Change |
|------|--------|
| `backend/services/claude.py` | Add `get_user_coaching_context()`; update `generate_daily_tip` and `generate_ask_tip` to accept `context` and use cached system block |
| `backend/routers/tips.py` | Call `get_user_coaching_context`, pass to both tip functions |
| `backend/routers/trades.py` | Add `_generate_debrief_bg()` helper; add `BackgroundTasks` param to `close_trade()`; schedule background debrief after commit |
| `tests/test_claude_service.py` | New — unit tests for `get_user_coaching_context` and prompt caching |
| `tests/test_tips.py` | New — HTTP tests confirming context is fetched and forwarded |
| `tests/test_trades.py` | Add 2 tests: background task is scheduled on close; `_generate_debrief_bg` writes debrief |

---

## Task 1: `get_user_coaching_context` function

**Files:**
- Modify: `backend/services/claude.py`
- Create: `tests/test_claude_service.py`

- [ ] **Step 1: Create the test file**

```python
# tests/test_claude_service.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.database import Base
from backend.models import User, Trade, SkillScore
from backend.services.claude import get_user_coaching_context


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def user(db):
    u = User(
        name="Alice",
        trading_stage="active",
        time_budget="30min",
        active_skills='["chart_reading", "entry_timing"]',
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_context_includes_user_profile(db, user):
    ctx = get_user_coaching_context(user, db)
    assert "Alice" in ctx
    assert "active" in ctx
    assert "30min" in ctx


def test_context_includes_weakest_skill(db, user):
    db.add(SkillScore(user_id=user.id, skill="chart_reading", score=42.0))
    db.add(SkillScore(user_id=user.id, skill="entry_timing", score=71.0))
    db.commit()
    ctx = get_user_coaching_context(user, db)
    assert "Chart Reading" in ctx
    assert "42" in ctx


def test_context_includes_recent_trades(db, user):
    db.add(Trade(
        user_id=user.id, symbol="AAPL", direction="long",
        setup_type="breakout", entry=100.0, stop=95.0, target=115.0,
        exit=114.0, shares=10, status="closed", date="2026-05-01",
        pnl=140.0, r_multiple=2.8, checklist_score=90.0,
    ))
    db.commit()
    ctx = get_user_coaching_context(user, db)
    assert "AAPL" in ctx
    assert "2.80R" in ctx
    assert "checklist 90%" in ctx


def test_context_omits_open_trades(db, user):
    db.add(Trade(
        user_id=user.id, symbol="TSLA", direction="long",
        entry=200.0, stop=190.0, target=230.0,
        shares=5, status="open", date="2026-05-20",
    ))
    db.commit()
    ctx = get_user_coaching_context(user, db)
    assert "TSLA" not in ctx


def test_context_no_data_returns_profile_only(db, user):
    ctx = get_user_coaching_context(user, db)
    assert "Alice" in ctx
    assert "Recent trades" not in ctx
    assert "Skill scores" not in ctx
```

- [ ] **Step 2: Run tests — expect ImportError or NameError (function doesn't exist yet)**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
python -m pytest tests/test_claude_service.py -v 2>&1 | head -30
```

Expected: `ImportError: cannot import name 'get_user_coaching_context'`

- [ ] **Step 3: Implement `get_user_coaching_context` in `backend/services/claude.py`**

Add this function after `_SKILL_LABELS` and before `call_claude`:

```python
def get_user_coaching_context(user, db) -> str:
    from backend.models import SkillScore, Trade

    lines = [f"User: {user.name} | Stage: {user.trading_stage} | Budget: {user.time_budget}"]

    scores = db.query(SkillScore).filter(SkillScore.user_id == user.id).all()
    if scores:
        weakest = min(scores, key=lambda s: s.score)
        weakest_label = _SKILL_LABELS.get(weakest.skill, weakest.skill)
        score_parts = [
            f"{_SKILL_LABELS.get(s.skill, s.skill)}: {s.score:.0f}"
            for s in sorted(scores, key=lambda s: s.score)
        ]
        lines.append(f"Weakest skill: {weakest_label} ({weakest.score:.0f})")
        lines.append("Skill scores: " + ", ".join(score_parts))

    trades = (
        db.query(Trade)
        .filter(Trade.user_id == user.id, Trade.status == "closed")
        .order_by(Trade.created_at.desc())
        .limit(20)
        .all()
    )
    if trades:
        lines.append(f"\nRecent trades (last {len(trades)} closed):")
        for t in trades:
            checklist = f", checklist {t.checklist_score:.0f}%" if t.checklist_score is not None else ""
            setup = f" {t.setup_type}" if t.setup_type else ""
            lines.append(f"  {t.symbol} {t.direction}{setup}: {t.r_multiple:.2f}R{checklist}")

    return "\n".join(lines)
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
python -m pytest tests/test_claude_service.py -v
```

Expected: 5 tests PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/services/claude.py tests/test_claude_service.py
git commit -m "feat: add get_user_coaching_context to claude service"
```

---

## Task 2: Prompt caching in tip functions + wire into tips.py

**Files:**
- Modify: `backend/services/claude.py` (update `generate_daily_tip`, `generate_ask_tip`)
- Modify: `backend/routers/tips.py`
- Create: `tests/test_tips.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_tips.py
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
```

- [ ] **Step 2: Run tests — expect failures**

```bash
python -m pytest tests/test_tips.py -v 2>&1 | head -40
```

Expected: `TypeError` or `AssertionError` — `generate_daily_tip` doesn't accept `context` yet

- [ ] **Step 3: Update `generate_daily_tip` in `backend/services/claude.py`**

Replace the existing `generate_daily_tip` function:

```python
def generate_daily_tip(skill: str, context: str = "") -> str:
    label = _SKILL_LABELS.get(skill, skill.replace("_", " ").title())
    if not _api_key:
        return (
            f"Tip for {label}: Focus on process over outcome. "
            "Set ANTHROPIC_API_KEY to get personalized AI coaching tips."
        )
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    role = (
        f"You are an expert swing trading coach giving a quick daily tip to a student "
        f"who needs to improve their {label} skill. "
        "Write one concise, practical tip (3-5 sentences) they can apply today. "
        "Reference this student's actual trade patterns where relevant. "
        "Focus on a single actionable insight. Be specific, not generic. "
        "Plain text only — no bullet points, no headers."
    )
    if context:
        system = [
            {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": role},
        ]
    else:
        system = role
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        system=system,
        messages=[{"role": "user", "content": f"Give me a daily tip on {label}."}],
    )
    return message.content[0].text
```

- [ ] **Step 4: Update `generate_ask_tip` in `backend/services/claude.py`**

Replace the existing `generate_ask_tip` function:

```python
def generate_ask_tip(question: str, context: str = "") -> str:
    if not _api_key:
        return "[AI answers unavailable — set ANTHROPIC_API_KEY to enable]"
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    role = (
        "You are an expert swing trading coach. "
        "Answer concisely and practically in 3-5 sentences. "
        "Reference this student's actual trade patterns where relevant. "
        "Focus on actionable advice specific to swing trading. Plain text only."
    )
    if context:
        system = [
            {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": role},
        ]
    else:
        system = role
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=system,
        messages=[{"role": "user", "content": question}],
    )
    return message.content[0].text
```

- [ ] **Step 5: Update `backend/routers/tips.py`**

In `get_daily_tip`, add context call before `generate_daily_tip`:

```python
@router.get("/daily")
def get_daily_tip(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today_start = datetime.combine(date_type.today(), datetime.min.time())
    existing = (
        db.query(Tip)
        .filter(Tip.user_id == user.id, Tip.question.is_(None), Tip.created_at >= today_start)
        .order_by(Tip.created_at.desc())
        .first()
    )
    if existing:
        return _tip_dict(existing)

    scores = db.query(SkillScore).filter(SkillScore.user_id == user.id).all()
    if scores:
        skill = min(scores, key=lambda s: s.score).skill
    else:
        active = json.loads(user.active_skills)
        skill = active[0] if active else "risk_sizing"

    context = claude_service.get_user_coaching_context(user, db)
    content = claude_service.generate_daily_tip(skill, context=context)
    tip = Tip(user_id=user.id, skill_area=skill, content=content)
    db.add(tip)
    db.commit()
    db.refresh(tip)
    return _tip_dict(tip)
```

In `ask_tip`, add context call before `generate_ask_tip`:

```python
@router.post("/ask")
def ask_tip(body: AskBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    context = claude_service.get_user_coaching_context(user, db)
    content = claude_service.generate_ask_tip(body.question, context=context)
    tip = Tip(user_id=user.id, question=body.question, content=content)
    db.add(tip)
    db.commit()
    db.refresh(tip)
    return _tip_dict(tip)
```

- [ ] **Step 6: Run all tip and claude tests**

```bash
python -m pytest tests/test_tips.py tests/test_claude_service.py -v
```

Expected: all tests PASS

- [ ] **Step 7: Run full test suite to check for regressions**

```bash
python -m pytest -v
```

Expected: all previously passing tests still PASS

- [ ] **Step 8: Commit**

```bash
git add backend/services/claude.py backend/routers/tips.py tests/test_tips.py
git commit -m "feat: inject user coaching context with prompt caching into tips"
```

---

## Task 3: Auto-debrief background task on trade close

**Files:**
- Modify: `backend/routers/trades.py`
- Modify: `tests/test_trades.py`

- [ ] **Step 1: Add 2 tests to `tests/test_trades.py`**

Add these tests at the bottom of the file:

```python
def test_close_trade_schedules_background_debrief(user_id):
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    with patch("backend.routers.trades._generate_debrief_bg") as mock_bg:
        client.put(f"/api/trades/{trade_id}/close", json={
            "exit_price": 930.0,
            "debrief": "Held to target.",
        })
    mock_bg.assert_called_once_with(trade_id)


def test_generate_debrief_bg_writes_ai_debrief(user_id):
    from backend.routers.trades import _generate_debrief_bg
    trade_id = client.post("/api/trades/", json=VALID_LONG).json()["id"]
    client.put(f"/api/trades/{trade_id}/close", json={
        "exit_price": 930.0,
        "debrief": "Good trade.",
    })
    # Patch SessionLocal to use the test DB session
    with patch("backend.routers.trades.SessionLocal", return_value=_Session()), \
         patch("backend.services.claude.generate_trade_debrief", return_value="AI result"):
        _generate_debrief_bg(trade_id)
    trade = client.get("/api/trades/").json()[0]
    assert trade["ai_debrief"] == "AI result"
```

Note: `_Session` is the test session factory defined at the top of the file. Import it at the top of the test additions or ensure it's in scope — it's already defined as `_Session = sessionmaker(...)` in the file.

- [ ] **Step 2: Run new tests — expect failures**

```bash
python -m pytest tests/test_trades.py::test_close_trade_schedules_background_debrief tests/test_trades.py::test_generate_debrief_bg_writes_ai_debrief -v
```

Expected: `ImportError: cannot import name '_generate_debrief_bg'`

- [ ] **Step 3: Update `backend/routers/trades.py`**

Add `logging` and `BackgroundTasks` imports at the top:

```python
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db, SessionLocal
from backend.auth import get_current_user
from backend.models import Trade, User
from backend.schemas import TradeCreate, TradeClose, TradeResponse
from backend.services import claude as claude_service

router = APIRouter(prefix="/trades", tags=["trades"])
logger = logging.getLogger(__name__)
```

Add `_generate_debrief_bg` as a module-level function (before the route functions):

```python
def _generate_debrief_bg(trade_id: int) -> None:
    db = SessionLocal()
    try:
        trade = db.query(Trade).filter(Trade.id == trade_id).first()
        if not trade or trade.status != "closed" or trade.ai_debrief:
            return
        trade.ai_debrief = claude_service.generate_trade_debrief(trade)
        db.commit()
    except Exception:
        logger.exception("Background debrief failed for trade %s", trade_id)
    finally:
        db.close()
```

Update `close_trade` signature and add the background task call after commit:

```python
@router.put("/{trade_id}/close", response_model=TradeResponse)
def close_trade(
    trade_id: int,
    body: TradeClose,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trade = db.query(Trade).filter(
        Trade.id == trade_id,
        Trade.user_id == current_user.id,
    ).first()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status == "closed":
        raise HTTPException(400, "Trade is already closed")
    if body.exit_price <= 0:
        raise HTTPException(400, "exit_price must be > 0")
    if not body.debrief.strip():
        raise HTTPException(400, "debrief is required")

    exit_price = body.exit_price
    if trade.direction == "long":
        pnl = (exit_price - trade.entry) * trade.shares
        r_multiple = (exit_price - trade.entry) / (trade.entry - trade.stop)
    else:
        pnl = (trade.entry - exit_price) * trade.shares
        r_multiple = (trade.entry - exit_price) / (trade.stop - trade.entry)

    trade.exit = exit_price
    trade.debrief = body.debrief
    trade.pnl = round(pnl, 2)
    trade.r_multiple = round(r_multiple, 4)
    trade.status = "closed"
    db.commit()
    db.refresh(trade)
    background_tasks.add_task(_generate_debrief_bg, trade_id)
    return _to_response(trade)
```

- [ ] **Step 4: Run new tests**

```bash
python -m pytest tests/test_trades.py::test_close_trade_schedules_background_debrief tests/test_trades.py::test_generate_debrief_bg_writes_ai_debrief -v
```

Expected: both PASS

- [ ] **Step 5: Run full test suite**

```bash
python -m pytest -v
```

Expected: all tests PASS (existing close trade tests still pass — `BackgroundTasks` is injected by FastAPI automatically)

- [ ] **Step 6: Commit**

```bash
git add backend/routers/trades.py tests/test_trades.py
git commit -m "feat: auto-trigger AI debrief as background task on trade close"
```

---

## Done

All three tasks complete. Phase 1 is live:
- Tips and Ask are grounded in the user's real trade history and skill scores
- Prompt caching is active — subsequent calls in the same session are faster
- Closing a trade auto-generates the AI debrief without blocking the response
- Manual `/api/trades/{id}/ai-debrief` endpoint remains as a refresh button
