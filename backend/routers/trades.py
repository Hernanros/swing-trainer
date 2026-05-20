from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Trade, User
from backend.schemas import TradeCreate, TradeClose, TradeResponse
from backend.services import claude as claude_service

router = APIRouter(prefix="/trades", tags=["trades"])


def _to_response(t: Trade) -> dict:
    return {
        "id":              t.id,
        "symbol":          t.symbol,
        "direction":       t.direction,
        "entry_price":     t.entry,
        "stop_price":      t.stop,
        "target_price":    t.target,
        "exit_price":      t.exit,
        "shares":          t.shares,
        "status":          t.status,
        "pre_note":        t.pre_note or "",
        "debrief":         t.debrief or "",
        "setup_type":      t.setup_type,
        "practice":        bool(t.practice),
        "checklist_score": t.checklist_score,
        "pnl":             t.pnl,
        "r_multiple":      t.r_multiple,
        "ai_debrief":      t.ai_debrief,
        "created_at":      t.created_at,
    }


@router.get("/", response_model=list[TradeResponse])
def list_trades(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trades = (
        db.query(Trade)
        .filter(Trade.user_id == current_user.id)
        .order_by(Trade.created_at.desc())
        .all()
    )
    return [_to_response(t) for t in trades]


@router.post("/", response_model=TradeResponse, status_code=201)
def open_trade(
    body: TradeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    symbol = body.symbol.upper().strip()
    if not symbol:
        raise HTTPException(400, "symbol is required")
    if body.direction not in ("long", "short"):
        raise HTTPException(400, "direction must be 'long' or 'short'")
    if body.entry_price <= 0 or body.stop_price <= 0 or body.target_price <= 0:
        raise HTTPException(400, "entry_price, stop_price, and target_price must be > 0")
    if body.shares < 1:
        raise HTTPException(400, "shares must be >= 1")
    if body.stop_price == body.entry_price:
        raise HTTPException(400, "stop_price must not equal entry_price")

    trade = Trade(
        user_id=current_user.id,
        symbol=symbol,
        direction=body.direction,
        entry=body.entry_price,
        stop=body.stop_price,
        target=body.target_price,
        shares=body.shares,
        pre_note=body.pre_note,
        status="open",
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        setup_type=body.setup_type or None,
        practice=body.practice,
        checklist_score=body.checklist_score,
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return _to_response(trade)


@router.put("/{trade_id}/close", response_model=TradeResponse)
def close_trade(
    trade_id: int,
    body: TradeClose,
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
    return _to_response(trade)


@router.post("/{trade_id}/ai-debrief", response_model=TradeResponse)
def generate_ai_debrief(
    trade_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trade = db.query(Trade).filter(
        Trade.id == trade_id,
        Trade.user_id == current_user.id,
    ).first()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != "closed":
        raise HTTPException(400, "Trade must be closed before generating a debrief")
    trade.ai_debrief = claude_service.generate_trade_debrief(trade)
    db.commit()
    db.refresh(trade)
    return _to_response(trade)
