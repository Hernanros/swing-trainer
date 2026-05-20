from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import PlaybookRule, User
from backend.schemas import (
    PlaybookRuleCreate, PlaybookRuleUpdate, PlaybookRuleResponse, VALID_TIERS
)

router = APIRouter(prefix="/playbook", tags=["playbook"])


@router.get("/setups", response_model=list[str])
def list_setups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(PlaybookRule.setup_type)
        .filter(PlaybookRule.user_id == current_user.id, PlaybookRule.active == True)
        .distinct()
        .all()
    )
    return sorted(r[0] for r in rows)


@router.get("/rules", response_model=list[PlaybookRuleResponse])
def list_rules(
    setup_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(PlaybookRule).filter(
        PlaybookRule.user_id == current_user.id,
        PlaybookRule.active == True,
    )
    if setup_type:
        q = q.filter(PlaybookRule.setup_type == setup_type)
    return q.order_by(PlaybookRule.setup_type, PlaybookRule.position).all()


@router.post("/rules", response_model=PlaybookRuleResponse, status_code=201)
def create_rule(
    body: PlaybookRuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.tier not in VALID_TIERS:
        raise HTTPException(400, f"tier must be one of: {sorted(VALID_TIERS)}")
    rule = PlaybookRule(
        user_id=current_user.id,
        setup_type=body.setup_type,
        text=body.text,
        tier=body.tier,
        position=body.position,
        active=True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=PlaybookRuleResponse)
def update_rule(
    rule_id: int,
    body: PlaybookRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = db.query(PlaybookRule).filter(
        PlaybookRule.id == rule_id,
        PlaybookRule.user_id == current_user.id,
    ).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    if body.tier is not None and body.tier not in VALID_TIERS:
        raise HTTPException(400, f"tier must be one of: {sorted(VALID_TIERS)}")
    if body.text is not None:
        rule.text = body.text
    if body.tier is not None:
        rule.tier = body.tier
    if body.position is not None:
        rule.position = body.position
    if body.active is not None:
        rule.active = body.active
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = db.query(PlaybookRule).filter(
        PlaybookRule.id == rule_id,
        PlaybookRule.user_id == current_user.id,
    ).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return Response(status_code=204)
