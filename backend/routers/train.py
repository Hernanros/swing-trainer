import json
import logging
import random
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import User, DrillResult, SkillScore, QuestionMastery
from pydantic import BaseModel as _BaseModel, Field
from backend.schemas import RiskCalcSubmit, DRILLS_PER_DAY, VALID_SKILLS, VALID_DRILL_KEYS
from backend.services.claude import call_claude
import anthropic as _anthropic

_log = logging.getLogger(__name__)


class QuizSubmit(_BaseModel):
    skill: str
    drill_type: str
    score: float   # 0 or 100
    detail: list = []


class AIDrillRequest(_BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)
    context: str = Field(..., max_length=1000)
    model_config = {"str_strip_whitespace": True}


class _AIQuestion(_BaseModel):
    q: str
    choices: list[str] = Field(..., min_length=4, max_length=4)
    answer: int = Field(..., ge=0, le=3)
    explanation: str

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


def _apply_mastery_transition(state: str, streak: int, is_correct: bool) -> tuple[str, int]:
    if is_correct:
        if state == 'new':
            return 'learning', 1
        if state == 'learning':
            new_streak = streak + 1
            return ('mastered', 3) if new_streak >= 3 else ('learning', new_streak)
        return state, streak  # mastered: shouldn't be shown, handle gracefully
    else:
        if state == 'learning':
            return 'new', 0
        return state, streak  # new stays new; mastered shouldn't appear


@router.get("/mastery/all")
def get_all_mastery(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(QuestionMastery)
        .filter(QuestionMastery.user_id == current_user.id)
        .all()
    )
    result: dict[str, list] = {}
    for r in rows:
        result.setdefault(r.drill_key, []).append(
            {"bank_idx": r.bank_idx, "state": r.state, "correct_streak": r.correct_streak}
        )
    return result


@router.get("/mastery/{drill_key}")
def get_mastery(
    drill_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if drill_key not in VALID_DRILL_KEYS:
        raise HTTPException(400, f"invalid drill_key: {drill_key}")
    rows = (
        db.query(QuestionMastery)
        .filter(
            QuestionMastery.user_id == current_user.id,
            QuestionMastery.drill_key == drill_key,
        )
        .all()
    )
    return [{"bank_idx": r.bank_idx, "state": r.state, "correct_streak": r.correct_streak} for r in rows]


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
        detail_json=json.dumps(body.detail) if body.detail else None,
    ))
    db.commit()
    _update_skill_score(current_user.id, body.skill, db)
    return {"score": body.score}


@router.post("/ai-drill")
def generate_ai_drill(body: AIDrillRequest, current_user: User = Depends(get_current_user)):
    prompt = f"""You are a swing trading quiz generator.

<topic>{body.topic}</topic>
<context>{body.context}</context>

Generate exactly 5 multiple-choice quiz questions testing understanding of this specific concept.
Return ONLY a JSON array with this exact shape, no markdown, no explanation:
[
  {{
    "q": "Question text",
    "choices": ["Option A", "Option B", "Option C", "Option D"],
    "answer": 0,
    "explanation": "Why this answer is correct"
  }}
]
The "answer" field is the 0-based index of the correct choice."""

    for attempt in range(2):
        try:
            raw = call_claude(prompt, max_tokens=1500)
            questions = json.loads(raw)
            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("empty response")
            validated = [_AIQuestion(**item).model_dump() for item in questions]
            return {"questions": validated}
        except _anthropic.AuthenticationError as exc:
            _log.error("AI service misconfigured (auth): %s", exc)
            raise HTTPException(500, "AI service is misconfigured")
        except (RuntimeError, ValueError) as exc:
            if "api_key" in str(exc).lower() or "not set" in str(exc).lower():
                _log.error("AI service misconfigured: %s", exc)
                raise HTTPException(500, "AI service is misconfigured")
            _log.warning("ai-drill attempt %d failed: %s", attempt + 1, exc)
            if attempt == 0:
                time.sleep(2)
        except Exception as exc:
            _log.warning("ai-drill attempt %d failed: %s", attempt + 1, exc)
            if attempt == 0:
                time.sleep(2)
    raise HTTPException(503, "Could not generate questions, try again")
