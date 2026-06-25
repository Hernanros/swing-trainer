import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db, SessionLocal
from backend.auth import get_current_user
from backend.models import Trade, User, ChecklistLog, PlaybookRule
from backend.schemas import TradeCreate, TradeClose, TradeUpdate, TradeResponse
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
        user = db.query(User).filter(User.id == trade.user_id).first()
        coaching_context = claude_service.get_user_coaching_context(user, db) if user else ""
        playbook_rules = (
            db.query(PlaybookRule)
            .filter(
                PlaybookRule.user_id == trade.user_id,
                PlaybookRule.setup_type == trade.setup_type,
                PlaybookRule.active == True,
            )
            .all()
        ) if trade.setup_type else []
        trade.ai_debrief = claude_service.generate_trade_debrief(trade, rule_detail, coaching_context, playbook_rules)
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
        "pre_trade_advisory":  t.pre_trade_advisory,
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
    if body.shares < 1:
        raise HTTPException(400, "shares must be >= 1")
    if body.entry_price <= 0:
        raise HTTPException(400, "entry_price must be > 0")
    if body.target_price <= 0:
        raise HTTPException(400, "target_price must be > 0")

    if body.trade_type == "option_spread":
        if not body.option_spread_type or body.option_spread_type not in VALID_SPREADS:
            raise HTTPException(400, f"option_spread_type must be one of: {sorted(VALID_SPREADS)}")
        if not body.option_expiry:
            raise HTTPException(400, "option_expiry is required for option spreads (YYYY-MM-DD)")
        if body.option_long_strike is None or body.option_long_strike <= 0:
            raise HTTPException(400, "option_long_strike must be > 0")
        if body.option_short_strike is None or body.option_short_strike <= 0:
            raise HTTPException(400, "option_short_strike must be > 0")
        if body.option_long_strike == body.option_short_strike:
            raise HTTPException(400, "option_long_strike and option_short_strike must differ")
        if body.stop_price < 0:
            raise HTTPException(400, "stop_price must be >= 0")
        direction = SPREAD_TO_DIR[body.option_spread_type]
    else:
        if body.direction not in ("long", "short"):
            raise HTTPException(400, "direction must be 'long' or 'short'")
        if body.stop_price <= 0:
            raise HTTPException(400, "stop_price must be > 0")
        if body.stop_price == body.entry_price:
            raise HTTPException(400, "stop_price must not equal entry_price")
        direction = body.direction

    trade = Trade(
        user_id=current_user.id,
        symbol=symbol,
        direction=direction,
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
        trade_type=body.trade_type,
        option_expiry=body.option_expiry,
        option_long_strike=body.option_long_strike,
        option_short_strike=body.option_short_strike,
        option_spread_type=body.option_spread_type,
        pre_trade_advisory=body.pre_trade_advisory,
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
    is_spread = (trade.trade_type or "equity") == "option_spread"
    if body.exit_price < 0:
        raise HTTPException(400, "exit_price must be >= 0")
    if not is_spread and body.exit_price <= 0:
        raise HTTPException(400, "exit_price must be > 0")
    if not body.debrief.strip():
        raise HTTPException(400, "debrief is required")

    exit_price = body.exit_price
    if is_spread:
        if trade.option_spread_type not in VALID_SPREADS:
            raise HTTPException(400, "Unknown option_spread_type; cannot close")
        is_debit = trade.option_spread_type in DEBIT_SPREADS
        if is_debit:
            pnl = (exit_price - trade.entry) * trade.shares * 100
        else:
            pnl = (trade.entry - exit_price) * trade.shares * 100
        metrics    = _compute_option_metrics(trade)
        r_multiple = round(pnl / metrics["max_loss"], 4) if metrics["max_loss"] else 0.0
    else:
        if trade.direction == "long":
            pnl  = (exit_price - trade.entry) * trade.shares
            risk = trade.entry - trade.stop
            r_multiple = ((exit_price - trade.entry) / risk) if risk else 0.0
        else:
            pnl  = (trade.entry - exit_price) * trade.shares
            risk = trade.stop - trade.entry
            r_multiple = ((trade.entry - exit_price) / risk) if risk else 0.0

    trade.exit = exit_price
    trade.debrief = body.debrief
    trade.pnl = round(pnl, 2)
    trade.r_multiple = round(r_multiple, 4)
    trade.status = "closed"

    rule_detail = None
    # Treat an all-unchecked submission as "checklist skipped" rather than "all rules violated".
    # The close UI also omits the field in that case, but guard server-side too so a stale client
    # can't produce false 0/100 "rules violated" debriefs.
    has_any_checked = bool(body.checklist_items) and any(i["checked"] for i in body.checklist_items)
    if body.checklist_items and has_any_checked:
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
        # Only must/should rules count as violated when unchecked — context rules are informational
        followed = [rule_map[i["rule_id"]] for i in body.checklist_items if i["checked"] and i["rule_id"] in rule_map]
        violated = [rule_map[i["rule_id"]] for i in body.checklist_items if not i["checked"] and i["tier"] in ("must", "should") and i["rule_id"] in rule_map]
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


@router.patch("/{trade_id}", response_model=TradeResponse)
def update_trade(
    trade_id: int,
    body: TradeUpdate,
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
        raise HTTPException(400, "Cannot edit a closed trade")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(trade, field, value)
    db.commit()
    db.refresh(trade)
    return _to_response(trade)


@router.delete("/{trade_id}", status_code=204)
def delete_trade(
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
    db.delete(trade)
    db.commit()


@router.post("/regenerate-debriefs")
def regenerate_debriefs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Regenerate ai_debrief for every closed trade owned by the current user.

    The new prompt falls through to the neutral "no checklist" branch, so old
    debriefs polluted by the pre-fix false-positive checklist behavior get
    replaced with structure/risk/lesson commentary only.
    """
    trades = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.status == "closed",
    ).all()
    coaching_context = claude_service.get_user_coaching_context(current_user, db)
    rules_by_setup: dict[str, list[PlaybookRule]] = {}
    regenerated = 0
    for trade in trades:
        setup = trade.setup_type
        if setup and setup not in rules_by_setup:
            rules_by_setup[setup] = (
                db.query(PlaybookRule)
                .filter(
                    PlaybookRule.user_id == current_user.id,
                    PlaybookRule.setup_type == setup,
                    PlaybookRule.active == True,
                )
                .all()
            )
        playbook_rules = rules_by_setup.get(setup, []) if setup else []
        try:
            trade.ai_debrief = claude_service.generate_trade_debrief(
                trade, coaching_context=coaching_context, playbook_rules=playbook_rules,
            )
            regenerated += 1
        except Exception:
            logger.exception("Regenerate debrief failed for trade %s", trade.id)
    db.commit()
    return {"regenerated": regenerated, "total_closed": len(trades)}


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
    coaching_context = claude_service.get_user_coaching_context(current_user, db)
    playbook_rules = (
        db.query(PlaybookRule)
        .filter(
            PlaybookRule.user_id == current_user.id,
            PlaybookRule.setup_type == trade.setup_type,
            PlaybookRule.active == True,
        )
        .all()
    ) if trade.setup_type else []
    trade.ai_debrief = claude_service.generate_trade_debrief(trade, coaching_context=coaching_context, playbook_rules=playbook_rules)
    db.commit()
    db.refresh(trade)
    return _to_response(trade)


class SpreadAdvisoryRequest(BaseModel):
    symbol: str
    option_spread_type: str
    option_long_strike: float
    option_short_strike: float
    option_expiry: str
    entry_price: float
    shares: int
    setup_type: Optional[str] = None


@router.post("/spread-advisory")
def get_spread_advisory(
    body: SpreadAdvisoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.option_spread_type not in VALID_SPREADS:
        raise HTTPException(400, f"option_spread_type must be one of: {sorted(VALID_SPREADS)}")

    if body.setup_type:
        rules = (
            db.query(PlaybookRule)
            .filter(
                PlaybookRule.user_id == current_user.id,
                PlaybookRule.setup_type == body.setup_type,
                PlaybookRule.active == True,
            )
            .all()
        )
    else:
        rules = []

    advisory = claude_service.generate_spread_advisory(body, rules)
    return {"advisory": advisory}
