import random
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import User, DrillResult, SkillScore
from pydantic import BaseModel
from backend.schemas import RiskCalcSubmit, DRILLS_PER_DAY, VALID_SKILLS


class QuizSubmit(BaseModel):
    skill: str
    drill_type: str
    score: float   # 0 or 100

router = APIRouter(prefix="/train", tags=["train"])


def _update_skill_score(user_id: int, skill: str, db: Session):
    results = (
        db.query(DrillResult)
        .filter(DrillResult.user_id == user_id, DrillResult.skill == skill)
        .order_by(DrillResult.created_at.desc())
        .limit(10)
        .all()
    )
    if not results:
        return
    # EMA oldest→newest so most recent score carries most weight
    scores = [r.score for r in reversed(results)]
    alpha = 0.3
    ema = scores[0]
    for s in scores[1:]:
        ema = alpha * s + (1 - alpha) * ema

    skill_score = db.query(SkillScore).filter(
        SkillScore.user_id == user_id, SkillScore.skill == skill
    ).first()
    if skill_score:
        skill_score.score = round(ema, 2)
    else:
        db.add(SkillScore(user_id=user_id, skill=skill, score=round(ema, 2)))
    db.commit()


@router.get("/today")
def get_today(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    drills_assigned = DRILLS_PER_DAY.get(current_user.time_budget, 1)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    completed = (
        db.query(DrillResult)
        .filter(DrillResult.user_id == current_user.id, DrillResult.date == today)
        .count()
    )
    return {
        "drills_assigned": drills_assigned,
        "drills_completed": completed,
        "remaining": max(0, drills_assigned - completed),
    }


@router.get("/risk-calc/generate")
def generate_risk_calc(current_user: User = Depends(get_current_user)):
    account_size = random.choice([10_000, 25_000, 50_000, 100_000])
    risk_pct = random.choice([0.5, 1.0, 1.5, 2.0])
    entry = round(random.uniform(10, 500), 2)
    stop_pct = random.choice([1, 2, 3, 5])
    stop = round(entry * (1 - stop_pct / 100), 2)
    return {
        "account_size": account_size,
        "risk_pct": risk_pct,
        "entry": entry,
        "stop": stop,
    }


@router.post("/risk-calc/submit")
def submit_risk_calc(
    body: RiskCalcSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    risk_amount = body.account_size * body.risk_pct / 100
    correct = int(risk_amount / (body.entry - body.stop))
    diff_pct = abs(body.user_answer - correct) / correct * 100 if correct else 100

    if diff_pct == 0:
        score = 100.0
    elif diff_pct <= 5:
        score = 80.0
    elif diff_pct <= 10:
        score = 60.0
    else:
        score = 0.0

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    drill = DrillResult(
        user_id=current_user.id,
        drill_type="risk_calc",
        skill="risk_sizing",
        score=score,
        date=today,
    )
    db.add(drill)
    db.commit()

    _update_skill_score(current_user.id, "risk_sizing", db)

    return {
        "correct_shares": correct,
        "user_answer": body.user_answer,
        "score": score,
        "diff_pct": round(diff_pct, 1),
    }


@router.post("/quiz/submit")
def submit_quiz(
    body: QuizSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.skill not in VALID_SKILLS:
        from fastapi import HTTPException
        raise HTTPException(400, f"invalid skill: {body.skill}")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    db.add(DrillResult(
        user_id=current_user.id,
        drill_type=body.drill_type,
        skill=body.skill,
        score=body.score,
        date=today,
    ))
    db.commit()
    _update_skill_score(current_user.id, body.skill, db)
    return {"score": body.score}
