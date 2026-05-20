# SwingTrainer — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the full project skeleton — FastAPI backend with SQLite, React frontend with routing, user creation/switching, and a navigable app shell with placeholder pages.

**Architecture:** FastAPI backend (port 7432) owns all data via SQLAlchemy + SQLite. React 18 + Vite frontend (port 5173) proxies `/api` to the backend. All user data is scoped by `user_id`. Onboarding runs on first launch; returning users see a user-picker.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy, SQLite, pytest; React 18, Vite, React Router v6

**Spec:** `docs/superpowers/specs/2026-05-08-swing-trainer-design.md`

**Subsequent plans:**
- Phase 2: Journal + Playbook
- Phase 3: Curriculum + Drills + Learning Modules
- Phase 4: Watchlist + Charts + Progress + AI Patterns

---

## File Map

```
swing-trainer/
├── backend/
│   ├── main.py                  # FastAPI app, CORS, lifespan, router mounts
│   ├── database.py              # SQLAlchemy engine, SessionLocal, Base, get_db
│   ├── models.py                # All ORM models (User, Trade, etc.)
│   ├── schemas.py               # Pydantic request/response models + constants
│   ├── routers/
│   │   ├── __init__.py
│   │   └── users.py             # CRUD for users + skill score initialisation
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx             # React root mount
│       ├── App.jsx              # Routes + UserProvider shell
│       ├── api.js               # All fetch calls to /api
│       ├── context/
│       │   └── UserContext.jsx  # Active user state, user list, switchUser
│       ├── components/
│       │   ├── Sidebar.jsx      # Nav links + user switcher dropdown
│       │   └── Onboarding.jsx   # 4-step new-user wizard
│       ├── pages/
│       │   ├── Home.jsx         # Time-aware greeting + placeholder cards
│       │   ├── Train.jsx        # Placeholder
│       │   ├── Journal.jsx      # Placeholder
│       │   ├── Watchlist.jsx    # Placeholder
│       │   └── Progress.jsx     # Placeholder
│       └── styles/
│           └── globals.css      # Full dark-theme design system
├── tests/
│   └── test_users.py
├── .env.example
└── .gitignore
```

---

## Task 1: Backend scaffolding

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example` (at project root)
- Create: `.gitignore`

- [ ] **Step 1: Create `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
pydantic==2.9.2
yfinance==0.2.44
anthropic==0.34.2
pytest==8.3.3
httpx==0.27.2
python-dotenv==1.0.1
```

- [ ] **Step 2: Create `.env.example` at project root**

```
ANTHROPIC_API_KEY=your_key_here
```

- [ ] **Step 3: Create `.gitignore` at project root**

```
__pycache__/
*.pyc
*.db
.env
.venv/
venv/
node_modules/
dist/
.DS_Store
```

- [ ] **Step 4: Create Python virtual environment and install dependencies**

Run (from `swing-trainer/backend/`):
```bash
python -m venv .venv
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
```

Expected: packages install without errors.

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt .env.example .gitignore
git commit -m "chore: backend scaffolding and dependencies"
```

---

## Task 2: Database setup

**Files:**
- Create: `backend/database.py`

- [ ] **Step 1: Write the failing import test**

Create `tests/test_db.py`:
```python
def test_engine_connects():
    from backend.database import engine
    with engine.connect() as conn:
        assert conn is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run from project root:
```bash
cd backend && python -m pytest ../tests/test_db.py -v
```
Expected: `ModuleNotFoundError: No module named 'backend.database'`

- [ ] **Step 3: Create `backend/database.py`**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./swing-trainer.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest ../tests/test_db.py -v
```
Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/database.py tests/test_db.py
git commit -m "feat: SQLAlchemy database setup"
```

---

## Task 3: Database models

**Files:**
- Create: `backend/models.py`

- [ ] **Step 1: Write failing model test**

Add to `tests/test_db.py`:
```python
def test_tables_created():
    from backend.database import engine, Base
    import backend.models  # noqa: F401 — registers models
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    for name in ["users", "trades", "checklist_logs", "playbook_rules",
                 "watchlist", "skill_scores", "drill_results",
                 "module_progress", "ai_patterns", "cached_content"]:
        assert name in tables, f"missing table: {name}"
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && python -m pytest ../tests/test_db.py::test_tables_created -v
```
Expected: `ModuleNotFoundError: No module named 'backend.models'`

- [ ] **Step 3: Create `backend/models.py`**

```python
import json
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
)
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    trading_stage = Column(String, nullable=False)   # learning | small_money | active
    time_budget = Column(String, nullable=False)     # 15min | 30min | 60min
    active_skills = Column(Text, nullable=False)     # JSON list
    created_at = Column(DateTime, default=datetime.utcnow)

    trades = relationship("Trade", back_populates="user", cascade="all, delete-orphan")
    playbook_rules = relationship("PlaybookRule", back_populates="user", cascade="all, delete-orphan")
    watchlist = relationship("WatchlistItem", back_populates="user", cascade="all, delete-orphan")
    skill_scores = relationship("SkillScore", back_populates="user", cascade="all, delete-orphan")
    drill_results = relationship("DrillResult", back_populates="user", cascade="all, delete-orphan")
    module_progress = relationship("ModuleProgress", back_populates="user", cascade="all, delete-orphan")
    ai_patterns = relationship("AIPattern", back_populates="user", cascade="all, delete-orphan")

    @property
    def active_skills_list(self):
        return json.loads(self.active_skills)


class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    symbol = Column(String, nullable=False)
    date = Column(String, nullable=False)
    direction = Column(String, nullable=False)       # long | short
    setup_type = Column(String, nullable=False)
    entry = Column(Float, nullable=False)
    stop = Column(Float, nullable=False)
    target = Column(Float, nullable=False)
    exit = Column(Float, nullable=True)
    shares = Column(Integer, nullable=False)
    status = Column(String, default="open")          # open | closed
    practice = Column(Boolean, default=False)
    pre_note = Column(Text, nullable=True)
    debrief = Column(Text, nullable=True)
    checklist_score = Column(Float, nullable=True)
    pnl = Column(Float, nullable=True)
    r_multiple = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="trades")
    checklist_logs = relationship("ChecklistLog", back_populates="trade", cascade="all, delete-orphan")


class ChecklistLog(Base):
    __tablename__ = "checklist_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    trade_id = Column(Integer, ForeignKey("trades.id"), nullable=False)
    rule_id = Column(Integer, ForeignKey("playbook_rules.id"), nullable=False)
    checked = Column(Boolean, default=False)
    tier = Column(String, nullable=False)            # must | should | context

    trade = relationship("Trade", back_populates="checklist_logs")


class PlaybookRule(Base):
    __tablename__ = "playbook_rules"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    setup_type = Column(String, nullable=False)
    text = Column(Text, nullable=False)
    tier = Column(String, nullable=False)            # must | should | context
    position = Column(Integer, default=0)
    active = Column(Boolean, default=True)

    user = relationship("User", back_populates="playbook_rules")


class WatchlistItem(Base):
    __tablename__ = "watchlist"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    symbol = Column(String, nullable=False)
    exchange = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    added_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="watchlist")


class SkillScore(Base):
    __tablename__ = "skill_scores"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    skill = Column(String, nullable=False)
    score = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="skill_scores")


class DrillResult(Base):
    __tablename__ = "drill_results"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    drill_type = Column(String, nullable=False)
    skill = Column(String, nullable=False)
    score = Column(Float, nullable=False)
    date = Column(String, nullable=False)
    detail_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="drill_results")


class ModuleProgress(Base):
    __tablename__ = "module_progress"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    module_slug = Column(String, nullable=False)
    status = Column(String, default="locked")        # locked | assigned | in_progress | completed
    quiz_score = Column(Float, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="module_progress")


class AIPattern(Base):
    __tablename__ = "ai_patterns"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pattern_text = Column(Text, nullable=False)
    severity = Column(String, nullable=False)        # problem | watch | strength
    detected_at = Column(DateTime, default=datetime.utcnow)
    trade_range = Column(String, nullable=True)

    user = relationship("User", back_populates="ai_patterns")


class CachedContent(Base):
    __tablename__ = "cached_content"
    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, nullable=False)  # e.g. module:breakout-entry:theory:level2
    content = Column(Text, nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest ../tests/test_db.py -v
```
Expected: both tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/models.py tests/test_db.py
git commit -m "feat: SQLAlchemy ORM models for all tables"
```

---

## Task 4: Schemas + constants

**Files:**
- Create: `backend/schemas.py`

- [ ] **Step 1: Create `backend/schemas.py`**

```python
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

VALID_SKILLS = [
    "chart_reading",
    "entry_timing",
    "risk_sizing",
    "setup_selection",
    "trade_management",
    "emotional_discipline",
]

VALID_STAGES = ["learning", "small_money", "active"]
VALID_TIME_BUDGETS = ["15min", "30min", "60min"]

# Drills per day by time budget
DRILLS_PER_DAY = {"15min": 1, "30min": 2, "60min": 3}


class UserCreate(BaseModel):
    name: str
    trading_stage: str
    time_budget: str
    active_skills: List[str]

    model_config = {"str_strip_whitespace": True}


class UserUpdate(BaseModel):
    name: Optional[str] = None
    trading_stage: Optional[str] = None
    time_budget: Optional[str] = None
    active_skills: Optional[List[str]] = None


class UserResponse(BaseModel):
    id: int
    name: str
    trading_stage: str
    time_budget: str
    active_skills: List[str]
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Write schema validation test**

Create `tests/test_schemas.py`:
```python
import pytest
from backend.schemas import UserCreate, VALID_SKILLS

def test_user_create_strips_whitespace():
    u = UserCreate(
        name="  Hernan  ",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=["chart_reading", "entry_timing"],
    )
    assert u.name == "Hernan"

def test_valid_skills_list_is_complete():
    assert len(VALID_SKILLS) == 6
    assert "emotional_discipline" in VALID_SKILLS
    assert "trade_management" in VALID_SKILLS
```

- [ ] **Step 3: Run tests**

```bash
cd backend && python -m pytest ../tests/test_schemas.py -v
```
Expected: both `PASSED`

- [ ] **Step 4: Commit**

```bash
git add backend/schemas.py tests/test_schemas.py
git commit -m "feat: Pydantic schemas and domain constants"
```

---

## Task 5: FastAPI app + user router

**Files:**
- Create: `backend/routers/__init__.py`
- Create: `backend/routers/users.py`
- Create: `backend/main.py`
- Create: `tests/test_users.py`

- [ ] **Step 1: Create `backend/routers/__init__.py`** (empty)

- [ ] **Step 2: Write failing user API tests**

Create `tests/test_users.py`:
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.main import app
from backend.database import Base, get_db

TEST_DB_URL = "sqlite:///./test.db"
_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def override_get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


client = TestClient(app)

VALID_USER = {
    "name": "Hernan",
    "trading_stage": "small_money",
    "time_budget": "30min",
    "active_skills": ["chart_reading", "entry_timing", "risk_sizing", "setup_selection"],
}


def test_health():
    assert client.get("/health").status_code == 200


def test_create_user_returns_201():
    resp = client.post("/api/users/", json=VALID_USER)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Hernan"
    assert data["active_skills"] == VALID_USER["active_skills"]
    assert "id" in data


def test_create_user_initialises_skill_scores():
    resp = client.post("/api/users/", json=VALID_USER)
    user_id = resp.json()["id"]
    scores_resp = client.get(f"/api/users/{user_id}/skills")
    assert scores_resp.status_code == 200
    scores = scores_resp.json()
    assert len(scores) == 4
    assert all(s["score"] == 0.0 for s in scores)


def test_create_user_invalid_skill():
    body = {**VALID_USER, "active_skills": ["chart_reading", "fake_skill"]}
    assert client.post("/api/users/", json=body).status_code == 400


def test_create_user_too_few_skills():
    body = {**VALID_USER, "active_skills": ["chart_reading"]}
    assert client.post("/api/users/", json=body).status_code == 400


def test_create_user_invalid_stage():
    body = {**VALID_USER, "trading_stage": "expert"}
    assert client.post("/api/users/", json=body).status_code == 400


def test_list_users():
    client.post("/api/users/", json=VALID_USER)
    resp = client.get("/api/users/")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_get_user():
    user_id = client.post("/api/users/", json=VALID_USER).json()["id"]
    resp = client.get(f"/api/users/{user_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Hernan"


def test_get_user_not_found():
    assert client.get("/api/users/999").status_code == 404


def test_update_user_name():
    user_id = client.post("/api/users/", json=VALID_USER).json()["id"]
    resp = client.put(f"/api/users/{user_id}", json={"name": "Hernan R."})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Hernan R."


def test_update_user_invalid_stage():
    user_id = client.post("/api/users/", json=VALID_USER).json()["id"]
    resp = client.put(f"/api/users/{user_id}", json={"trading_stage": "guru"})
    assert resp.status_code == 400
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && python -m pytest ../tests/test_users.py -v
```
Expected: `ModuleNotFoundError: No module named 'backend.main'`

- [ ] **Step 4: Create `backend/routers/users.py`**

```python
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import User, SkillScore
from schemas import (
    UserCreate, UserUpdate, UserResponse,
    VALID_SKILLS, VALID_STAGES, VALID_TIME_BUDGETS,
)

router = APIRouter(prefix="/users", tags=["users"])


def _to_response(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "trading_stage": user.trading_stage,
        "time_budget": user.time_budget,
        "active_skills": json.loads(user.active_skills),
        "created_at": user.created_at,
    }


def _validate_user_body(body):
    if body.trading_stage is not None and body.trading_stage not in VALID_STAGES:
        raise HTTPException(400, f"trading_stage must be one of {VALID_STAGES}")
    if body.time_budget is not None and body.time_budget not in VALID_TIME_BUDGETS:
        raise HTTPException(400, f"time_budget must be one of {VALID_TIME_BUDGETS}")
    if body.active_skills is not None:
        invalid = [s for s in body.active_skills if s not in VALID_SKILLS]
        if invalid:
            raise HTTPException(400, f"invalid skills: {invalid}")
        if len(body.active_skills) < 2:
            raise HTTPException(400, "must select at least 2 skills")


@router.get("/", response_model=List[UserResponse])
def list_users(db: Session = Depends(get_db)):
    return [_to_response(u) for u in db.query(User).all()]


@router.post("/", response_model=UserResponse, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    _validate_user_body(body)
    user = User(
        name=body.name,
        trading_stage=body.trading_stage,
        time_budget=body.time_budget,
        active_skills=json.dumps(body.active_skills),
    )
    db.add(user)
    db.flush()
    for skill in body.active_skills:
        db.add(SkillScore(user_id=user.id, skill=skill, score=0.0))
    db.commit()
    db.refresh(user)
    return _to_response(user)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "user not found")
    return _to_response(user)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "user not found")
    _validate_user_body(body)
    if body.name is not None:
        user.name = body.name
    if body.trading_stage is not None:
        user.trading_stage = body.trading_stage
    if body.time_budget is not None:
        user.time_budget = body.time_budget
    if body.active_skills is not None:
        user.active_skills = json.dumps(body.active_skills)
    db.commit()
    db.refresh(user)
    return _to_response(user)


@router.get("/{user_id}/skills")
def get_user_skills(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "user not found")
    scores = db.query(SkillScore).filter(SkillScore.user_id == user_id).all()
    return [{"skill": s.skill, "score": s.score, "updated_at": s.updated_at} for s in scores]
```

- [ ] **Step 5: Create `backend/main.py`**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models  # noqa: F401 — registers ORM models with Base
from routers import users


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="SwingTrainer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Run all backend tests**

```bash
cd backend && python -m pytest ../tests/ -v
```
Expected: all tests `PASSED`

- [ ] **Step 7: Smoke-test the running server**

```bash
cd backend && uvicorn main:app --port 7432 --reload
```
In a second terminal:
```bash
curl http://localhost:7432/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 8: Commit**

```bash
git add backend/main.py backend/routers/__init__.py backend/routers/users.py tests/test_users.py
git commit -m "feat: FastAPI app with user CRUD and skill score initialisation"
```

---

## Task 6: Frontend scaffolding

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/styles/globals.css`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "swing-trainer",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `frontend/vite.config.js`**

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:7432',
    },
  },
})
```

- [ ] **Step 3: Create `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SwingTrainer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `frontend/src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
```

- [ ] **Step 5: Create `frontend/src/styles/globals.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #0f1117;
  --surface:  #161b22;
  --surface2: #1c2128;
  --border:   #21262d;
  --border2:  #30363d;
  --text:     #e0e0e0;
  --text2:    #c9d1d9;
  --muted:    #8b949e;
  --dim:      #6e7681;
  --accent:   #58a6ff;
  --green:    #3fb950;
  --yellow:   #d29922;
  --red:      #f85149;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; }

/* App shell */
.app-shell { display: flex; height: 100vh; max-width: 1200px; margin: 0 auto; }
.main-content { flex: 1; overflow-y: auto; }
.loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: var(--muted); }

/* Sidebar */
.sidebar { width: 200px; background: var(--surface); border-right: 1px solid var(--border); padding: 20px 0; display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar-brand { padding: 0 20px 24px; font-size: 1.1em; font-weight: 700; color: var(--accent); border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.sidebar-brand span { font-size: 0.7em; color: var(--dim); font-weight: 400; display: block; margin-top: 2px; }
.nav-item { padding: 10px 20px; font-size: 0.9em; color: var(--muted); border-left: 3px solid transparent; display: flex; align-items: center; gap: 10px; text-decoration: none; }
.nav-item.active { color: var(--text); border-left-color: var(--accent); background: var(--surface2); }
.nav-item:hover:not(.active) { color: var(--text2); background: rgba(255,255,255,0.03); }
.nav-icon { font-size: 1.1em; width: 20px; text-align: center; }
.sidebar-spacer { flex: 1; }
.user-switcher { padding: 12px 16px; border-top: 1px solid var(--border); }
.user-switcher select { width: 100%; background: var(--surface2); border: 1px solid var(--border2); border-radius: 6px; color: var(--text2); padding: 6px 8px; font-size: 0.82em; }

/* Pages */
.page { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.topbar { display: flex; justify-content: space-between; align-items: flex-start; }
.greeting { font-size: 1.15em; font-weight: 700; color: #fff; }
.phase-label { font-size: 0.82em; color: var(--muted); margin-top: 3px; }
.level-badge { background: var(--surface2); border: 1px solid var(--border2); border-radius: 20px; padding: 6px 14px; font-size: 0.82em; color: var(--text2); white-space: nowrap; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.placeholder-card { background: var(--surface); border: 1px dashed var(--border2); border-radius: 10px; padding: 24px; color: var(--dim); font-size: 0.85em; text-align: center; }

/* Onboarding */
.onboarding { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 40px 20px; gap: 8px; }
.onboarding h1 { font-size: 1.8em; color: var(--accent); margin-bottom: 4px; }
.onboarding h2 { font-size: 1.05em; color: var(--text2); margin-bottom: 16px; text-align: center; }
.onboarding-step { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 10px; }
.onb-input { background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; color: var(--text); font-size: 1em; padding: 12px 16px; outline: none; width: 100%; font-family: var(--font); }
.onb-input:focus { border-color: var(--accent); }
.onb-option { background: var(--surface2); border: 2px solid var(--border2); border-radius: 8px; padding: 14px 16px; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
.onb-option:hover { border-color: var(--muted); }
.onb-option.selected { border-color: var(--accent); background: rgba(88,166,255,0.08); }
.onb-option strong { color: var(--text); font-size: 0.92em; }
.onb-option span { color: var(--muted); font-size: 0.78em; }
.onb-btn { background: #238636; color: #fff; border: none; border-radius: 8px; padding: 12px; font-size: 0.95em; font-weight: 600; cursor: pointer; margin-top: 8px; font-family: var(--font); }
.onb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.onb-error { color: var(--red); font-size: 0.82em; text-align: center; }
.user-pick-list { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 320px; margin-bottom: 16px; }
.user-pick-btn { background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; color: var(--text); padding: 14px; font-size: 0.95em; cursor: pointer; font-family: var(--font); text-align: left; }
.user-pick-btn:hover { border-color: var(--accent); }
.link-btn { background: none; border: none; color: var(--accent); font-size: 0.85em; cursor: pointer; font-family: var(--font); }
```

- [ ] **Step 6: Install frontend dependencies**

```bash
cd frontend && npm install
```
Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: React + Vite frontend scaffolding with design system CSS"
```

---

## Task 7: API client + UserContext

**Files:**
- Create: `frontend/src/api.js`
- Create: `frontend/src/context/UserContext.jsx`

- [ ] **Step 1: Create `frontend/src/api.js`**

```javascript
const BASE = '/api'

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export const api = {
  users: {
    list: () => request('GET', '/users/'),
    create: (body) => request('POST', '/users/', body),
    get: (id) => request('GET', `/users/${id}`),
    update: (id, body) => request('PUT', `/users/${id}`, body),
    skills: (id) => request('GET', `/users/${id}/skills`),
  },
}
```

- [ ] **Step 2: Create `frontend/src/context/UserContext.jsx`**

```jsx
import React, { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedId = localStorage.getItem('activeUserId')
    api.users.list()
      .then(list => {
        setUsers(list)
        if (savedId) {
          const found = list.find(u => u.id === parseInt(savedId, 10))
          if (found) setUser(found)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  function switchUser(u) {
    setUser(u)
    localStorage.setItem('activeUserId', String(u.id))
  }

  function addUser(u) {
    setUsers(prev => [...prev, u])
    switchUser(u)
  }

  return (
    <UserContext.Provider value={{ user, users, loading, switchUser, addUser }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js frontend/src/context/
git commit -m "feat: API client and UserContext"
```

---

## Task 8: Onboarding component

**Files:**
- Create: `frontend/src/components/Onboarding.jsx`

- [ ] **Step 1: Create `frontend/src/components/Onboarding.jsx`**

```jsx
import React, { useState } from 'react'
import { api } from '../api'
import { useUser } from '../context/UserContext'

const SKILLS = [
  { key: 'chart_reading',       label: 'Chart Reading',       desc: 'Key levels, trend structure, setup validity' },
  { key: 'entry_timing',        label: 'Entry Timing',        desc: 'Precision and confirmation of entries' },
  { key: 'risk_sizing',         label: 'Risk & Sizing',       desc: 'Position sizing, stop adherence' },
  { key: 'setup_selection',     label: 'Setup Selection',     desc: 'Avoiding low-quality setups' },
  { key: 'trade_management',    label: 'Trade Management',    desc: 'Holding through noise, managing exits' },
  { key: 'emotional_discipline',label: 'Emotional Discipline',desc: 'FOMO, revenge trading, execution' },
]

const STAGES = [
  { key: 'learning',    label: 'Still Learning',    desc: 'Not trading real money yet' },
  { key: 'small_money', label: 'Small Real Money',  desc: 'Testing my edge with real stakes' },
  { key: 'active',      label: 'Active Trader',     desc: 'Trading regularly, scaling up' },
]

const BUDGETS = [
  { key: '15min', label: '15–20 min / day', desc: '1 drill + quick journal' },
  { key: '30min', label: '30–45 min / day', desc: '2 drills + learning module' },
  { key: '60min', label: '1 hour+ / day',   desc: 'Full session with chart study' },
]

export default function Onboarding() {
  const { users, addUser, switchUser } = useUser()
  const [step, setStep]     = useState(users.length > 0 ? 'pick' : 'name')
  const [name, setName]     = useState('')
  const [stage, setStage]   = useState('')
  const [budget, setBudget] = useState('')
  const [skills, setSkills] = useState([])
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  function toggleSkill(key) {
    setSkills(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])
  }

  async function finish() {
    if (skills.length < 2) { setError('Select at least 2 skill areas'); return }
    setSaving(true)
    setError('')
    try {
      const u = await api.users.create({
        name,
        trading_stage: stage,
        time_budget: budget,
        active_skills: skills,
      })
      addUser(u)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  if (step === 'pick') {
    return (
      <div className="onboarding">
        <h1>SwingTrainer</h1>
        <h2>Who's training today?</h2>
        <div className="user-pick-list">
          {users.map(u => (
            <button key={u.id} className="user-pick-btn" onClick={() => switchUser(u)}>
              {u.name}
            </button>
          ))}
        </div>
        <button className="link-btn" onClick={() => setStep('name')}>+ New user</button>
      </div>
    )
  }

  return (
    <div className="onboarding">
      <h1>SwingTrainer</h1>

      {step === 'name' && (
        <div className="onboarding-step">
          <h2>What's your name?</h2>
          <input
            className="onb-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && name.trim() && setStep('stage')}
          />
          <button className="onb-btn" disabled={!name.trim()} onClick={() => setStep('stage')}>
            Next →
          </button>
        </div>
      )}

      {step === 'stage' && (
        <div className="onboarding-step">
          <h2>Where are you in your trading journey?</h2>
          {STAGES.map(s => (
            <div
              key={s.key}
              className={`onb-option${stage === s.key ? ' selected' : ''}`}
              onClick={() => setStage(s.key)}
            >
              <strong>{s.label}</strong>
              <span>{s.desc}</span>
            </div>
          ))}
          <button className="onb-btn" disabled={!stage} onClick={() => setStep('budget')}>Next →</button>
        </div>
      )}

      {step === 'budget' && (
        <div className="onboarding-step">
          <h2>How much time can you give daily?</h2>
          {BUDGETS.map(b => (
            <div
              key={b.key}
              className={`onb-option${budget === b.key ? ' selected' : ''}`}
              onClick={() => setBudget(b.key)}
            >
              <strong>{b.label}</strong>
              <span>{b.desc}</span>
            </div>
          ))}
          <button className="onb-btn" disabled={!budget} onClick={() => setStep('skills')}>Next →</button>
        </div>
      )}

      {step === 'skills' && (
        <div className="onboarding-step">
          <h2>Which areas do you want to develop?</h2>
          <p style={{fontSize:'0.8em',color:'var(--muted)',marginBottom:'4px'}}>Select 2–6</p>
          {SKILLS.map(s => (
            <div
              key={s.key}
              className={`onb-option${skills.includes(s.key) ? ' selected' : ''}`}
              onClick={() => toggleSkill(s.key)}
            >
              <strong>{s.label}</strong>
              <span>{s.desc}</span>
            </div>
          ))}
          {error && <p className="onb-error">{error}</p>}
          <button className="onb-btn" disabled={saving} onClick={finish}>
            {saving ? 'Setting up…' : 'Start Training →'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Onboarding.jsx
git commit -m "feat: 4-step user onboarding wizard"
```

---

## Task 9: Sidebar + placeholder pages

**Files:**
- Create: `frontend/src/components/Sidebar.jsx`
- Create: `frontend/src/pages/Home.jsx`
- Create: `frontend/src/pages/Train.jsx`
- Create: `frontend/src/pages/Journal.jsx`
- Create: `frontend/src/pages/Watchlist.jsx`
- Create: `frontend/src/pages/Progress.jsx`

- [ ] **Step 1: Create `frontend/src/components/Sidebar.jsx`**

```jsx
import React from 'react'
import { NavLink } from 'react-router-dom'
import { useUser } from '../context/UserContext'

const NAV = [
  { to: '/',          icon: '🏠', label: 'Home',      exact: true },
  { to: '/train',     icon: '🎯', label: 'Train' },
  { to: '/journal',   icon: '📓', label: 'Journal' },
  { to: '/watchlist', icon: '👁️', label: 'Watchlist' },
  { to: '/progress',  icon: '📈', label: 'Progress' },
]

export default function Sidebar() {
  const { user, users, switchUser } = useUser()

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        SwingTrainer
        <span>v2.0</span>
      </div>

      {NAV.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}

      <div className="sidebar-spacer" />

      {users.length > 1 && (
        <div className="user-switcher">
          <select
            value={user?.id ?? ''}
            onChange={e => {
              const found = users.find(u => u.id === parseInt(e.target.value, 10))
              if (found) switchUser(found)
            }}
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      )}
    </nav>
  )
}
```

- [ ] **Step 2: Create `frontend/src/pages/Home.jsx`**

```jsx
import React from 'react'
import { useUser } from '../context/UserContext'

function getPhase() {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  if (h < 9 || (h === 9 && m < 30)) return 'pre-market'
  if (h < 16) return 'market'
  return 'post-market'
}

const PHASE_LABEL = {
  'pre-market': 'Pre-market',
  'market':     'Market Hours',
  'post-market':'Post-market',
}

const LEVEL_NAMES = ['Beginner', 'Building Edge', 'Developing Edge', 'Consistent Trader', 'Skilled Trader']

function overallLevel(skills) {
  if (!skills || skills.length === 0) return 1
  const avg = skills.reduce((s, x) => s + x.score, 0) / skills.length
  if (avg < 25) return 1
  if (avg < 45) return 2
  if (avg < 65) return 3
  if (avg < 85) return 4
  return 5
}

export default function Home() {
  const { user } = useUser()
  const h = new Date().getHours()
  const greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const phase = getPhase()
  const level = 1  // Phase 3 will compute from real skill scores

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Good {greeting}, {user.name}</div>
          <div className="phase-label">{PHASE_LABEL[phase]}</div>
        </div>
        <div className="level-badge">Level {level} · {LEVEL_NAMES[level - 1]}</div>
      </div>

      <div className="placeholder-card">
        <strong>Today's Training Session</strong>
        <p style={{marginTop:8}}>Drills coming in Phase 3.</p>
      </div>

      <div className="grid-2">
        <div className="placeholder-card">
          <strong>Skill Progress</strong>
          <p style={{marginTop:8}}>Charts coming in Phase 3.</p>
        </div>
        <div className="placeholder-card">
          <strong>Open Positions</strong>
          <p style={{marginTop:8}}>Trade tracking coming in Phase 2.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="placeholder-card">
          <strong>Training Streak</strong>
          <p style={{marginTop:8}}>Coming in Phase 3.</p>
        </div>
        <div className="placeholder-card">
          <strong>This Week's Edge</strong>
          <p style={{marginTop:8}}>Stats coming in Phase 2.</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create placeholder pages**

Create `frontend/src/pages/Train.jsx`:
```jsx
import React from 'react'
export default function Train() {
  return <div className="page"><h2 style={{color:'var(--text)'}}>Train</h2><div className="placeholder-card" style={{marginTop:16}}>Drills and learning modules — Phase 3.</div></div>
}
```

Create `frontend/src/pages/Journal.jsx`:
```jsx
import React from 'react'
export default function Journal() {
  return <div className="page"><h2 style={{color:'var(--text)'}}>Journal</h2><div className="placeholder-card" style={{marginTop:16}}>Trade log and Playbook — Phase 2.</div></div>
}
```

Create `frontend/src/pages/Watchlist.jsx`:
```jsx
import React from 'react'
export default function Watchlist() {
  return <div className="page"><h2 style={{color:'var(--text)'}}>Watchlist</h2><div className="placeholder-card" style={{marginTop:16}}>Setup scanner — Phase 4.</div></div>
}
```

Create `frontend/src/pages/Progress.jsx`:
```jsx
import React from 'react'
export default function Progress() {
  return <div className="page"><h2 style={{color:'var(--text)'}}>Progress</h2><div className="placeholder-card" style={{marginTop:16}}>Skill scores and AI patterns — Phase 4.</div></div>
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/pages/
git commit -m "feat: sidebar navigation and placeholder pages"
```

---

## Task 10: App shell — wire everything together

**Files:**
- Create: `frontend/src/App.jsx`

- [ ] **Step 1: Create `frontend/src/App.jsx`**

```jsx
import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './context/UserContext'
import Sidebar from './components/Sidebar'
import Onboarding from './components/Onboarding'
import Home from './pages/Home'
import Train from './pages/Train'
import Journal from './pages/Journal'
import Watchlist from './pages/Watchlist'
import Progress from './pages/Progress'

function AppShell() {
  const { user, loading } = useUser()

  if (loading) return <div className="loading">Loading…</div>
  if (!user)   return <Onboarding />

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/train"     element={<Train />} />
          <Route path="/journal/*" element={<Journal />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/progress"  element={<Progress />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <UserProvider>
      <AppShell />
    </UserProvider>
  )
}
```

- [ ] **Step 2: Start both servers and verify the full flow**

Terminal 1 — backend:
```bash
cd backend && uvicorn main:app --port 7432 --reload
```

Terminal 2 — frontend:
```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` in browser.

Expected flow:
1. Onboarding wizard appears (no users exist yet)
2. Complete all 4 steps (name → stage → budget → skills)
3. App shell appears with sidebar and Home page
4. All 5 nav links navigate to their placeholder pages
5. Reload the page → app remembers the user, skips onboarding

- [ ] **Step 3: Add a second user and verify user-switcher appears**

Click "+ New user" (go back to onboarding by clearing localStorage or adding the button — see note).

> **Note:** To test the user-switcher during development, open browser console and run `localStorage.removeItem('activeUserId')` then reload. The user-picker screen appears. Create a second user. After returning to the app, the sidebar dropdown becomes visible.

- [ ] **Step 4: Run full backend test suite one final time**

```bash
cd backend && python -m pytest ../tests/ -v
```
Expected: all `PASSED`

- [ ] **Step 5: Final Phase 1 commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: complete Phase 1 — app shell, onboarding, user switching"
```

---

## Self-Review Checklist

- [x] **Spec §2 Architecture** — FastAPI + SQLite + React covered ✓
- [x] **Spec §3 User Onboarding** — 4-step wizard: name, stage, budget, skills ✓
- [x] **Spec §3 Multi-user** — UserContext + user-switcher dropdown in sidebar ✓
- [x] **Spec §5 Six skill areas** — all 6 in `VALID_SKILLS`, initialised to 0 on user create ✓
- [x] **Spec §11 Data model** — all 10 tables defined in models.py ✓
- [x] **Spec §4 Home screen** — time-aware greeting, phase label, level badge, placeholder cards ✓
- [x] **No placeholders in code** — all steps contain complete code ✓
- [x] **Type consistency** — `_to_response` used in all user router methods ✓
- [x] **Tests exist** — `test_db.py`, `test_schemas.py`, `test_users.py` cover backend ✓

**Not in this plan (covered by later phases):**
- Journal, Playbook, Trade logging → Phase 2
- Drills, skill scoring, modules → Phase 3
- Watchlist, charts, Progress, AI patterns → Phase 4
