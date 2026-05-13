import os
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.database import get_db

DEV_BYPASS_AUTH = os.getenv("DEV_BYPASS_AUTH", "false").lower() == "true"
ALLOWED_EMAILS = {e.strip() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()}

if not DEV_BYPASS_AUTH and not ALLOWED_EMAILS:
    import warnings
    warnings.warn("ALLOWED_EMAILS is empty — all OAuth logins will be denied", stacklevel=1)


def require_auth(request: Request):
    if DEV_BYPASS_AUTH:
        return
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_user(request: Request, db: Session = Depends(get_db)):
    from backend.models import User  # local import to avoid circular
    if DEV_BYPASS_AUTH:
        user = db.query(User).first()
        if not user:
            raise HTTPException(status_code=404, detail="No users found")
        return user
    email = request.session.get("email")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
