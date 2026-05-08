import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.models import User, SkillScore
from backend.schemas import (
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
