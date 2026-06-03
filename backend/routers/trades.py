import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db, SessionLocal
from backend.auth import get_current_user
from backend.models import Trade, User, ChecklistLog, PlaybookRule
from backend.schemas import TradeCreate, TradeClose, TradeResponse
from backend.services import claude as claude_service

router = APIRouter(prefix="/trades", tags=["trades"])
logger = logging.getLogger(__name__)

DEBIT_SPREADS  = {"bull_call", "bear_put"}
VALID_SPREADS  = {"bull_call", "bear_put", "bull_put", "bear_call"}
SPREAD_TO_DIR  = {"bull_call": "long", "bull_put": "long",
                  "bear_put": "short", "bear_call": "short"}


def _compute_option_metrics(trade) -> dict:
    if trade.option_spread_type not in VALID_SPREADS:
        return {"max_loss": None, "max_profit": None, "breakeven": None}
    long_s  = trade.option_long_strike  or 0.0
    short_s = trade.option_short_strike or 0.0
    width = abs(long_s - short_s)
    entry     = trade.entry
    contracts = trade.shares
    is_debit  = trade.option_spread_type in DEBIT_SPREADS
    if is_debit:
        max_loss   = round(entry * contracts * 100, 2)
        max_profit = round((width - entry) * contracts * 100, 2)
        breakeven  = (
            round(long_s + entry, 4)
            if trade.option_spread_type == "bull_call"
            else round(long_s - entry, 4)
        )
    else:
        max_loss   = round((width - entry) * contracts * 100, 2)
        max_profit = round(entry * contracts * 100, 2)
        breakeven  = (
            round(short_s - entry, 4)
            if trade.option_spread_type == "bull_put"
            else round(short_s + entry, 4)
        )
    return {"max_loss": max_loss, "max_profit": max_profit, "breakeven": breakeven}


def _generate_debrief_bg(trade_id: int, rule_detail: Optional[dict] = None) -> None:
    db = SessionLocal()
    try:
        trade = db.query(Trade).filter(Trade.id == trade_id).first()
        if not trade or trade.status != "closed" or trade.ai_debrief:
            return
        trade.ai_debrief = claude_service.generate_trade_debrief(trade, rule_detail)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Background debrief failed for trade %s", trade_id)
    finally:
        db.close()


def _to_response(t: Trade) -> dict:
    base = {
        "id":                  t.id,
        "symbol":              t.symbol,
        "direction":           t.direction,
        "entry_price":         t.entry,
        "stop_price":          t.stop,
        "target_price":        t.target,
        "exit_price":          t.exit,
        "shares":              t.shares,
        "status":              t.status,
        "pre_note":            t.pre_note or "",
        "debrief":             t.debrief or "",
        "setup_type":          t.setup_type,
        "practice":            bool(t.practice),
        "checklist_score":     t.checklist_score,
        "pnl":                 t.pnl,
        "r_multiple":          t.r_multiple,
        "ai_debrief":          t.ai_debrief,
        "created_at":          t.created_at,
        "trade_date":          t.trade_date,
        "trade_type":          t.trade_type or "equity",
        "option_expiry":       t.option_expiry,
        "option_long_strike":  t.option_long_strike,
        "option_short_strike": t.option_short_strike,
        "option_spread_type":  t.option_spread_type,
        "max_profit":          None,
        "max_loss":            None,
        "breakeven":           None,
    }
    if (t.trade_type or "equity") == "option_spread" and t.option_spread_type:
        base.update(_compute_option_metrics(t))
    return base


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
        trade_date=body.trade_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
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

    rule_detail = None
    if body.checklist_items:
        rule_ids = [item["rule_id"] for item in body.checklist_items]
        rule_map = {
            r.id: r.text
            for r in db.query(PlaybookRule).filter(PlaybookRule.id.in_(rule_ids)).all()
        }
        for item in body.checklist_items:
            db.add(ChecklistLog(
                user_id=trade.user_id,
                trade_id=trade.id,
                rule_id=item["rule_id"],
                checked=item["checked"],
                tier=item["tier"],
            ))
        scoreable = [i for i in body.checklist_items if i["tier"] in ("must", "should")]
        if scoreable:
            checked_count = sum(1 for i in scoreable if i["checked"])
            trade.checklist_score = round(checked_count / len(scoreable) * 100, 1)
        followed = [rule_map[i["rule_id"]] for i in body.checklist_items if i["checked"] and i["rule_id"] in rule_map]
        violated = [rule_map[i["rule_id"]] for i in body.checklist_items if not i["checked"] and i["rule_id"] in rule_map]
        rule_detail = {"followed": followed, "violated": violated}

    db.commit()
    db.refresh(trade)

    closed_count = db.query(Trade).filter(
        Trade.user_id == trade.user_id,
        Trade.status == "closed",
        Trade.practice == False,
    ).count()

    background_tasks.add_task(_generate_debrief_bg, trade.id, rule_detail)

    response = _to_response(trade)
    response["closed_count"] = closed_count
    return response


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
