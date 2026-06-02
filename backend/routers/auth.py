import os
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from authlib.integrations.starlette_client import OAuth
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import AccessRequest
from backend.services.email import send_access_request_notification

router = APIRouter()

_oauth = OAuth()
_oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET", ""),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


@router.get("/auth/login")
async def auth_login(request: Request):
    redirect_uri = request.url_for("auth_callback")
    return await _oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/auth/callback", name="auth_callback")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    from backend.auth import ALLOWED_EMAILS, ADMIN_EMAIL
    token = await _oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo", {})
    email = userinfo.get("email", "")
    name  = userinfo.get("name", "")
    if not email:
        return RedirectResponse(url="/auth/forbidden", status_code=302)

    if email == ADMIN_EMAIL or email in ALLOWED_EMAILS:
        request.session["email"] = email
        return RedirectResponse(url="/", status_code=302)

    req = db.query(AccessRequest).filter(AccessRequest.email == email).first()
    if req is None:
        req = AccessRequest(email=email, name=name, requested_at=datetime.now(timezone.utc))
        db.add(req)
        db.commit()
        send_access_request_notification(email, name)

    request.session["email"] = email
    return RedirectResponse(url="/", status_code=302)


@router.get("/auth/logout")
async def auth_logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/", status_code=302)


@router.get("/auth/forbidden")
async def auth_forbidden():
    return JSONResponse({"error": "Access denied."}, status_code=403)
