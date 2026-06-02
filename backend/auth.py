import os
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.database import get_db

DEV_BYPASS_AUTH = os.getenv("DEV_BYPASS_AUTH", "false").lower() == "true"
ALLOWED_EMAILS  = {e.strip() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()}
ADMIN_EMAIL     = os.getenv("ADMIN_EMAIL", "")


def require_auth(request: Request):
    if DEV_BYPASS_AUTH:
        return
    if not request.session.get("email"):
        raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_user(request: Request, db: Session = Depends(get_db)):
    from backend.models import User
    if DEV_BYPASS_AUTH:
        user = db.query(User).first()
        if not user:
            raise HTTPException(status_code=404, detail="No users found")
        return user
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User profile not found — complete onboarding first")
    return user


def get_admin_user(request: Request):
    if DEV_BYPASS_AUTH:
        return
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not ADMIN_EMAIL or email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access required")
