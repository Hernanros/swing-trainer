from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import CurriculumCheck, User

router = APIRouter(prefix="/curriculum", tags=["curriculum"])


class CheckBody(BaseModel):
    item_id: str


@router.get("/")
def get_checks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(CurriculumCheck).filter(CurriculumCheck.user_id == user.id).all()
    return [r.item_id for r in rows]


@router.post("/check")
def check_item(body: CheckBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(CurriculumCheck).filter(
        CurriculumCheck.user_id == user.id,
        CurriculumCheck.item_id == body.item_id,
    ).first()
    if not existing:
        db.add(CurriculumCheck(user_id=user.id, item_id=body.item_id))
        db.commit()
    return {"ok": True}


@router.delete("/check/{item_id}")
def uncheck_item(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(CurriculumCheck).filter(
        CurriculumCheck.user_id == user.id,
        CurriculumCheck.item_id == item_id,
    ).delete()
    db.commit()
    return {"ok": True}
