import json
from datetime import datetime, date as date_type
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Tip, SkillScore, User
from backend.services import claude as claude_service

router = APIRouter(prefix="/tips", tags=["tips"])


class AskBody(BaseModel):
    question: str


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


@router.get("/library")
def get_library(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tips = db.query(Tip).filter(Tip.user_id == user.id).order_by(Tip.created_at.desc()).all()
    return [_tip_dict(t) for t in tips]


@router.post("/ask")
def ask_tip(body: AskBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    context = claude_service.get_user_coaching_context(user, db)
    content = claude_service.generate_ask_tip(body.question, context=context)
    tip = Tip(user_id=user.id, question=body.question, content=content)
    db.add(tip)
    db.commit()
    db.refresh(tip)
    return _tip_dict(tip)


def _tip_dict(tip: Tip) -> dict:
    return {
        "id": tip.id,
        "skill_area": tip.skill_area,
        "question": tip.question,
        "content": tip.content,
        "created_at": tip.created_at.isoformat(),
    }
