from contextlib import asynccontextmanager
import os
import logging
from fastapi import FastAPI, Depends, Request
from fastapi.responses import FileResponse

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import text
from backend.database import engine
import backend.models as models  # noqa: F401
from backend.routers import users
from backend.routers import auth as auth_router
from backend.routers import trades as trades_router
from backend.routers import playbook as playbook_router
from backend.routers import progress as progress_router
from backend.routers import market as market_router
from backend.routers import watchlist as watchlist_router
from backend.routers import train as train_router
from backend.routers import tips as tips_router
from backend.routers import curriculum as curriculum_router
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
        trade_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(trades)"))]
        if "practice" not in trade_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN practice BOOLEAN DEFAULT FALSE"))
            conn.commit()
        if "checklist_score" not in trade_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN checklist_score REAL"))
            conn.commit()
        if "ai_debrief" not in trade_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN ai_debrief TEXT"))
            conn.commit()
        if "trade_date" not in trade_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN trade_date TEXT"))
            conn.commit()
        wl_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(watchlist)"))]
        if "tags" not in wl_cols:
            conn.execute(text("ALTER TABLE watchlist ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'"))
            conn.commit()
        # Make trades.setup_type nullable (was accidentally created NOT NULL)
        setup_col = {row[1]: row[3] for row in conn.execute(text("PRAGMA table_info(trades)"))}
        if setup_col.get("setup_type") == 1:  # notnull == 1 means NOT NULL
            conn.execute(text("""
                CREATE TABLE trades_migrated AS SELECT * FROM trades;
            """))
            conn.execute(text("DROP TABLE trades"))
            conn.execute(text("""
                CREATE TABLE trades (
                    id INTEGER NOT NULL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    symbol VARCHAR NOT NULL,
                    date VARCHAR NOT NULL,
                    direction VARCHAR NOT NULL,
                    setup_type VARCHAR,
                    entry FLOAT NOT NULL,
                    stop FLOAT NOT NULL,
                    target FLOAT NOT NULL,
                    exit FLOAT,
                    shares INTEGER NOT NULL,
                    status VARCHAR,
                    practice BOOLEAN,
                    pre_note TEXT,
                    debrief TEXT,
                    checklist_score FLOAT,
                    pnl FLOAT,
                    r_multiple FLOAT,
                    ai_debrief TEXT,
                    trade_date TEXT,
                    created_at DATETIME
                )
            """))
            conn.execute(text("""
                INSERT INTO trades SELECT
                    id, user_id, symbol, date, direction, setup_type, entry, stop, target,
                    exit, shares, status, practice, pre_note, debrief, checklist_score, pnl,
                    r_multiple, ai_debrief, trade_date, created_at
                FROM trades_migrated
            """))
            conn.execute(text("DROP TABLE trades_migrated"))
            conn.commit()
            _log.info("Migrated trades.setup_type to nullable")
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
app.include_router(playbook_router.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(progress_router.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(market_router.router, prefix="/api")
app.include_router(watchlist_router.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(train_router.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(tips_router.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(curriculum_router.router, prefix="/api", dependencies=[Depends(require_auth)])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/debug/routes")
def debug_routes():
    return [{"path": getattr(r, "path", str(r)), "methods": sorted(getattr(r, "methods", None) or [])} for r in app.routes]


@app.get("/api/me")
def get_me(request: Request):
    email = request.session.get("email") if not _DEV_MODE else None
    return {"email": email}


_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(_frontend_dist):
    _assets_dir = os.path.join(_frontend_dist, "assets")
    if os.path.isdir(_assets_dir):
        # Hashed assets — browsers may cache aggressively
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    _NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}

    @app.get("/sw.js", include_in_schema=False)
    async def serve_sw():
        return FileResponse(os.path.join(_frontend_dist, "sw.js"), headers=_NO_CACHE)

    @app.get("/manifest.json", include_in_schema=False)
    async def serve_manifest():
        return FileResponse(os.path.join(_frontend_dist, "manifest.json"), headers=_NO_CACHE)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Serve any existing static file (e.g. favicon.ico), otherwise SPA shell
        candidate = os.path.join(_frontend_dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_frontend_dist, "index.html"), headers=_NO_CACHE)
