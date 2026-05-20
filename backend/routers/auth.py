import os
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse
from authlib.integrations.starlette_client import OAuth

from backend.auth import ALLOWED_EMAILS

router = APIRouter()

_oauth = OAuth()
_oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET", ""),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email"},
)


@router.get("/auth/login")
async def auth_login(request: Request):
    redirect_uri = request.url_for("auth_callback")
    return await _oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/auth/callback", name="auth_callback")
async def auth_callback(request: Request):
    token = await _oauth.google.authorize_access_token(request)
    email = token.get("userinfo", {}).get("email", "")
    if not email or email not in ALLOWED_EMAILS:
        return RedirectResponse(url="/auth/forbidden", status_code=302)
    request.session["email"] = email
    return RedirectResponse(url="/", status_code=302)


@router.get("/auth/logout")
async def auth_logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/", status_code=302)


@router.get("/auth/forbidden")
async def auth_forbidden():
    return JSONResponse(
        {"error": "Access denied. Your email is not on the allowed list."},
        status_code=403,
    )
