# Paper Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a virtual paper account to the Progress page that tracks starting balance, realized P&L from closed paper trades, and capital deployed in open paper spread trades.

**Architecture:** New `PaperAccount` SQLAlchemy model (one row per user) seeded from `BullProfile.account_size`. A new router handles GET (compute snapshot) and PUT (override balance). The Progress page adds a card above the existing paper stats section that loads and displays the snapshot.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite (lifespan migration), React/Vite, existing `api.js` request helper.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/models.py` | Modify | Add `PaperAccount` ORM model |
| `backend/main.py` | Modify | CREATE TABLE IF NOT EXISTS migration + mount router |
| `backend/routers/paper_account.py` | Create | GET /paper-account + PUT /paper-account/balance |
| `backend/schemas.py` | Modify | Add `PaperAccountBalanceUpdate` schema |
| `tests/test_paper_account.py` | Create | All backend tests |
| `frontend/src/api.js` | Modify | Add `api.paperAccount` namespace |
| `frontend/src/pages/Progress.jsx` | Modify | Add Paper Account card |

---

## Task 1: Add PaperAccount model

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Add the model**

Open `backend/models.py`. After the `BullProfile` class (around line 220), add:

```python
class PaperAccount(Base):
    __tablename__ = "paper_accounts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    starting_balance = Column(Float, nullable=False)
    updated_at = Column(String, nullable=False)

    user = relationship("User", back_populates="paper_account")
```

- [ ] **Step 2: Add back-reference on User**

In the `User` class (around line 20), add to the relationship block:

```python
paper_account = relationship("PaperAccount", back_populates="user", uselist=False, cascade="all, delete-orphan")
```

- [ ] **Step 3: Commit**

```bash
git add backend/models.py
git commit -m "feat(paper-account): add PaperAccount model"
```

---

## Task 2: Add schema

**Files:**
- Modify: `backend/schemas.py`

- [ ] **Step 1: Add PaperAccountBalanceUpdate**

Open `backend/schemas.py`. Add near the end (before any `if __name__` block or at the end of the file):

```python
class PaperAccountBalanceUpdate(BaseModel):
    starting_balance: float
```

- [ ] **Step 2: Commit**

```bash
git add backend/schemas.py
git commit -m "feat(paper-account): add PaperAccountBalanceUpdate schema"
```

---

## Task 3: Create backend router with tests

**Files:**
- Create: `backend/routers/paper_account.py`
- Create: `tests/test_paper_account.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_paper_account.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.main import app
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Base, User, Trade, BullProfile

SQLALCHEMY_DATABASE_URL = "sqlite://"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(autouse=True)
def setup():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    user = User(email="test@test.com", name="Test", status="approved")
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()

    def override_auth():
        db2 = TestingSessionLocal()
        u = db2.query(User).first()
        db2.close()
        return u

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_auth
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)

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
    from datetime import datetime, timezone, date
    now = datetime.now(timezone.utc).isoformat()
    db.add(Trade(user_id=user.id, symbol="AAPL", trade_type="equity", entry=100.0,
                 status="closed", practice=True, pnl=500.0, trade_date=date.today().isoformat()))
    db.add(Trade(user_id=user.id, symbol="MSFT", trade_type="equity", entry=200.0,
                 status="closed", practice=True, pnl=-200.0, trade_date=date.today().isoformat()))
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
    # bull put spread: short=50, long=45, premium=1.50, contracts=2
    # max_loss = (50-45-1.50)*100*2 = 3.50*100*2 = 700
    db.add(Trade(
        user_id=user.id, symbol="SPY", trade_type="option_spread",
        option_spread_type="bull_put_spread", entry=1.50,
        option_short_strike=50.0, option_long_strike=45.0, contracts=2,
        status="open", practice=True, trade_date=date.today().isoformat()
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
                 status="closed", practice=False, pnl=1000.0, trade_date=date.today().isoformat()))
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
```

- [ ] **Step 2: Run tests — expect ImportError (router doesn't exist yet)**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
pytest tests/test_paper_account.py -v 2>&1 | head -30
```

Expected: errors about missing module or 404s.

- [ ] **Step 3: Create the router**

Create `backend/routers/paper_account.py`:

```python
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import User, Trade, BullProfile, PaperAccount
from backend.schemas import PaperAccountBalanceUpdate

router = APIRouter(prefix="/paper-account", tags=["paper_account"])


def _compute_snapshot(user_id: int, db: Session, starting_balance: float) -> dict:
    closed = db.query(Trade).filter_by(user_id=user_id, practice=True, status="closed").all()
    realized_pnl = sum(t.pnl for t in closed if t.pnl is not None)
    current_balance = starting_balance + realized_pnl

    open_spreads = db.query(Trade).filter(
        Trade.user_id == user_id,
        Trade.practice == True,
        Trade.status == "open",
        Trade.option_spread_type.isnot(None),
    ).all()

    capital_deployed = 0.0
    for t in open_spreads:
        if all(v is not None for v in [t.option_short_strike, t.option_long_strike, t.entry, t.contracts]):
            spread_width = abs(t.option_short_strike - t.option_long_strike)
            max_loss = (spread_width - t.entry) * 100 * t.contracts
            if max_loss > 0:
                capital_deployed += max_loss

    cash_available = max(0.0, current_balance - capital_deployed)
    pct_at_risk = round(capital_deployed / starting_balance * 100, 1) if starting_balance > 0 else 0.0

    return {
        "starting_balance": starting_balance,
        "realized_pnl": round(realized_pnl, 2),
        "current_balance": round(current_balance, 2),
        "capital_deployed": round(capital_deployed, 2),
        "cash_available": round(cash_available, 2),
        "pct_at_risk": pct_at_risk,
        "open_spread_count": len(open_spreads),
        "closed_trade_count": len(closed),
    }


def _get_or_create_account(user_id: int, db: Session) -> PaperAccount:
    account = db.query(PaperAccount).filter_by(user_id=user_id).first()
    if not account:
        profile = db.query(BullProfile).filter_by(user_id=user_id).first()
        starting_balance = profile.account_size if profile else 10000.0
        now = datetime.now(timezone.utc).isoformat()
        account = PaperAccount(user_id=user_id, starting_balance=starting_balance, updated_at=now)
        db.add(account)
        db.commit()
        db.refresh(account)
    return account


@router.get("")
def get_paper_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    account = _get_or_create_account(current_user.id, db)
    return _compute_snapshot(current_user.id, db, account.starting_balance)


@router.put("/balance")
def update_balance(
    body: PaperAccountBalanceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = _get_or_create_account(current_user.id, db)
    account.starting_balance = body.starting_balance
    account.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return _compute_snapshot(current_user.id, db, account.starting_balance)
```

- [ ] **Step 4: Run tests — expect failures due to missing router mount**

```bash
pytest tests/test_paper_account.py -v 2>&1 | head -40
```

Expected: 404s (router not mounted yet).

- [ ] **Step 5: Commit router + tests**

```bash
git add backend/routers/paper_account.py tests/test_paper_account.py
git commit -m "feat(paper-account): add router + tests (unmounted)"
```

---

## Task 4: Wire router + migration into main.py

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add migration in lifespan**

Open `backend/main.py`. In the lifespan function, find the block where `ALTER TABLE` / migration SQL runs. Add after the existing migration statements:

```python
conn.execute(text("""
    CREATE TABLE IF NOT EXISTS paper_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        starting_balance REAL NOT NULL,
        updated_at TEXT NOT NULL
    )
"""))
```

- [ ] **Step 2: Mount the router**

In `backend/main.py`, find the section where other routers are imported and included. Add:

```python
from backend.routers.paper_account import router as paper_account_router
```

Then in the router-mounting block:

```python
app.include_router(paper_account_router, prefix="/api")
```

- [ ] **Step 3: Run all tests — expect green**

```bash
pytest tests/test_paper_account.py -v
```

Expected output:
```
PASSED tests/test_paper_account.py::test_get_paper_account_creates_default_when_no_profile
PASSED tests/test_paper_account.py::test_get_paper_account_seeds_from_bull_profile
PASSED tests/test_paper_account.py::test_get_paper_account_sums_realized_pnl
PASSED tests/test_paper_account.py::test_get_paper_account_computes_capital_deployed
PASSED tests/test_paper_account.py::test_get_paper_account_ignores_real_trades
PASSED tests/test_paper_account.py::test_put_balance_updates_starting_balance
6 passed
```

- [ ] **Step 4: Run full test suite to check for regressions**

```bash
pytest --tb=short 2>&1 | tail -20
```

Expected: all previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py
git commit -m "feat(paper-account): mount router and add migration"
```

---

## Task 5: Add api.paperAccount to frontend

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add namespace**

Open `frontend/src/api.js`. Find the `bull:` section. After it (before `me:`), add:

```js
  paperAccount: {
    get:        () =>     request('GET', '/paper-account'),
    setBalance: (body) => request('PUT', '/paper-account/balance', body),
  },
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(paper-account): add api.paperAccount namespace"
```

---

## Task 6: Add Paper Account card to Progress page

**Files:**
- Modify: `frontend/src/pages/Progress.jsx`

- [ ] **Step 1: Add state and fetch**

Open `frontend/src/pages/Progress.jsx`. At the top of the `Progress` component function, add state for the paper account:

```jsx
const [paperAccount, setPaperAccount] = useState(null)
const [editingBalance, setEditingBalance] = useState(false)
const [balanceInput, setBalanceInput] = useState('')
const [savingBalance, setSavingBalance] = useState(false)
```

In the existing `useEffect` that fetches stats, add a parallel fetch for the paper account:

```jsx
// Add to the Promise.all or as a separate fetch alongside it:
api.paperAccount.get().then(setPaperAccount).catch(() => null)
```

- [ ] **Step 2: Add the save handler**

Inside the `Progress` component, add:

```jsx
async function handleSaveBalance(e) {
  e.preventDefault()
  const val = parseFloat(balanceInput)
  if (isNaN(val) || val <= 0) return
  setSavingBalance(true)
  try {
    const updated = await api.paperAccount.setBalance({ starting_balance: val })
    setPaperAccount(updated)
    setEditingBalance(false)
  } catch {
    // silent — user can retry
  } finally {
    setSavingBalance(false)
  }
}
```

- [ ] **Step 3: Add the card component**

Add this helper function outside the `Progress` component (at the bottom of the file, before the last export or after other helpers):

```jsx
function PaperAccountCard({ data, editing, balanceInput, onEditClick, onBalanceChange, onSave, saving }) {
  if (!data) return null
  const pnlColor = data.realized_pnl >= 0 ? 'var(--green)' : 'var(--red)'
  const balColor = data.current_balance >= data.starting_balance ? 'var(--green)' : 'var(--red)'
  const fmt = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em', margin: '0 0 10px' }}>
        PAPER ACCOUNT
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', fontSize: 13 }}>
        <span style={{ color: 'var(--muted)' }}>Starting Balance</span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(data.starting_balance)}</span>

        <span style={{ color: 'var(--muted)' }}>Realized P&L</span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace', color: pnlColor }}>
          {data.realized_pnl >= 0 ? '+' : ''}{fmt(data.realized_pnl)}
        </span>

        <span style={{ color: 'var(--text)', fontWeight: 700 }}>Current Balance</span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: balColor }}>
          {fmt(data.current_balance)}
        </span>
      </div>

      <div style={{ borderTop: '1px solid var(--border2)', margin: '10px 0' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', fontSize: 13 }}>
        <span style={{ color: 'var(--muted)' }}>
          Capital Deployed{data.open_spread_count > 0 ? ` (${data.open_spread_count} open)` : ''}
        </span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(data.capital_deployed)}</span>

        <span style={{ color: 'var(--muted)' }}>Cash Available</span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(data.cash_available)}</span>

        <span style={{ color: 'var(--muted)' }}>% At Risk</span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace',
          color: data.pct_at_risk > 20 ? 'var(--red)' : data.pct_at_risk > 10 ? 'var(--accent)' : 'var(--text2)' }}>
          {data.pct_at_risk.toFixed(1)}%
        </span>
      </div>

      <div style={{ marginTop: 10 }}>
        {editing ? (
          <form onSubmit={onSave} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number"
              value={balanceInput}
              onChange={e => onBalanceChange(e.target.value)}
              placeholder="New starting balance"
              min="1"
              step="100"
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 5,
                color: 'var(--text)', padding: '4px 8px', fontSize: 12 }}
            />
            <button
              type="submit"
              disabled={saving}
              style={{ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#111',
                padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => onEditClick(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => { onEditClick(true); onBalanceChange(String(data.starting_balance)) }}
            style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 5,
              color: 'var(--muted)', fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
          >
            Edit Balance
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Render the card**

In the `Progress` component's JSX, find the paper stats section (the block that starts with `{stats.paper?.closed_trades > 0 && (`). Insert the card **above** it:

```jsx
<PaperAccountCard
  data={paperAccount}
  editing={editingBalance}
  balanceInput={balanceInput}
  onEditClick={(v) => setEditingBalance(v)}
  onBalanceChange={setBalanceInput}
  onSave={handleSaveBalance}
  saving={savingBalance}
/>
```

- [ ] **Step 5: Build frontend and verify no errors**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend"
npm run build 2>&1 | tail -10
```

Expected: `✓ built in ...ms` with no errors (chunk size warning is ok).

- [ ] **Step 6: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/pages/Progress.jsx
git commit -m "feat(paper-account): add Paper Account card to Progress page"
```

---

## Task 7: Build, deploy, and smoke test

- [ ] **Step 1: Run full test suite one final time**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
pytest --tb=short 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 2: Build frontend**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend"
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit dist and deploy**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/dist
git commit -m "build: rebuild frontend for paper account"
railway up --detach
```

- [ ] **Step 4: Smoke test on live app**

1. Open the live app → navigate to Progress
2. Verify Paper Account card appears with $10,000 starting balance (or BullProfile amount)
3. Click "Edit Balance", enter 25000, click Save — card updates
4. Open a paper spread trade in Journal → confirm Capital Deployed increases
5. Close a paper trade with P&L → confirm Realized P&L and Current Balance update

---

## Self-Review

- **Spec coverage:** ✓ Starting balance seeded from BullProfile with override. ✓ Realized P&L from closed paper trades. ✓ Current balance = starting + realized. ✓ Capital deployed from open paper spreads. ✓ Cash available. ✓ % at risk. ✓ Card on Progress page. ✓ Edit Balance button.
- **Placeholders:** None — all steps have exact code.
- **Type consistency:** `_compute_snapshot` called identically in both GET and PUT handlers. `PaperAccount` model fields match migration SQL. `api.paperAccount.get()` → `/paper-account` matches router prefix `/paper-account` with `@router.get("")`.
- **Edge cases covered:** No BullProfile → $10k default. No open spreads → capital_deployed = 0. cash_available floored at 0 to avoid negative display.
