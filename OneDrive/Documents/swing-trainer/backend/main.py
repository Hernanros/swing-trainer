from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import text
from backend.database import engine
import backend.models as models  # noqa: F401
from backend.routers import users
from backend.routers import auth as auth_router
from backend.routers import trades as trades_router
from backend.auth import require_auth

SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")
_DEV_MODE = os.getenv("DEV_BYPASS_AUTH", "false").lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(users)"))]
        if "email" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN email TEXT"))
            conn.commit()
    yield


app = FastAPI(title="SwingTrainer API", lifespan=lifespan)

app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, https_only=not _DEV_MODE)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"] if _DEV_MODE else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(users.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(trades_router.router, prefix="/api", dependencies=[Depends(require_auth)])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/me")
def get_me(request: Request):
    email = request.session.get("email") if not _DEV_MODE else None
    return {"email": email}


_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
