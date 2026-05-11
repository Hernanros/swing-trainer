import os
from fastapi import Request, HTTPException

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
