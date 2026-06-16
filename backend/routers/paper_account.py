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
        if all(v is not None for v in [t.option_short_strike, t.option_long_strike, t.entry, t.shares]):
            spread_width = abs(t.option_short_strike - t.option_long_strike)
            max_loss = (spread_width - t.entry) * 100 * t.shares
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
