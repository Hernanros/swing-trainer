from contextlib import asynccontextmanager
import os
import logging
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.responses import FileResponse

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.database import engine, get_db
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
from backend.routers import admin as admin_router
from backend.routers import bull as bull_router
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
        ai_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(ai_patterns)"))]
        if "skill" not in ai_cols:
            conn.execute(text("ALTER TABLE ai_patterns ADD COLUMN skill TEXT"))
            conn.commit()
        option_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(trades)"))]
        if "trade_type" not in option_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN trade_type TEXT NOT NULL DEFAULT 'equity'"))
            conn.commit()
        if "option_expiry" not in option_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN option_expiry TEXT"))
            conn.commit()
        if "option_long_strike" not in option_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN option_long_strike REAL"))
            conn.commit()
        if "option_short_strike" not in option_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN option_short_strike REAL"))
            conn.commit()
        if "option_spread_type" not in option_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN option_spread_type TEXT"))
            conn.commit()
        if "pre_trade_advisory" not in option_cols:
            conn.execute(text("ALTER TABLE trades ADD COLUMN pre_trade_advisory TEXT"))
            conn.commit()

        # Bull Assistant tables
        bull_profile_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(bull_profiles)"))]
        if not bull_profile_cols:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS bull_profiles (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                    account_size REAL NOT NULL,
                    risk_per_trade_pct REAL NOT NULL DEFAULT 1.0,
                    max_contracts INTEGER NOT NULL DEFAULT 5,
                    updated_at TEXT
                )
            """))
            conn.commit()

        bull_scan_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(bull_scans)"))]
        if not bull_scan_cols:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS bull_scans (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    scan_date TEXT NOT NULL,
                    macro_json TEXT,
                    sectors_json TEXT,
                    results_json TEXT,
                    created_at TEXT
                )
            """))
            conn.commit()

    # ── Daily Bull Scan Scheduler ─────────────────────────────────────────────
    US_MARKET_HOLIDAYS_2026 = {
        "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
        "2026-05-25", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    }

    async def _run_scheduled_bull_scan():
        from datetime import date as _date, datetime as _datetime, timezone as _tz
        from backend.database import SessionLocal
        from backend.models import BullProfile, BullScan, PlaybookRule
        from backend.services.bull import run_pipeline
        from backend.services.options import get_options_provider
        import json as _json
        today = _date.today().isoformat()
        if today in US_MARKET_HOLIDAYS_2026:
            _log.info("Bull scan skipped — market holiday %s", today)
            return
        db = SessionLocal()
        try:
            for profile_row in db.query(BullProfile).all():
                try:
                    rules = [r.text for r in db.query(PlaybookRule).filter_by(user_id=profile_row.user_id).all()]
                    profile_dict = {
                        "account_size": profile_row.account_size,
                        "risk_per_trade_pct": profile_row.risk_per_trade_pct,
                        "max_contracts": profile_row.max_contracts,
                    }
                    result = run_pipeline(
                        options_provider=get_options_provider(),
                        playbook_rules=rules,
                        bull_profile=profile_dict,
                    )
                    now = _datetime.now(_tz.utc).isoformat()
                    existing = db.query(BullScan).filter_by(user_id=profile_row.user_id, scan_date=today).first()
                    if existing:
                        existing.macro_json = _json.dumps(result["macro"])
                        existing.sectors_json = _json.dumps(result["sectors"])
                        existing.results_json = _json.dumps(result["candidates"])
                        existing.created_at = now
                    else:
                        db.add(BullScan(
                            user_id=profile_row.user_id,
                            scan_date=today,
                            macro_json=_json.dumps(result["macro"]),
                            sectors_json=_json.dumps(result["sectors"]),
                            results_json=_json.dumps(result["candidates"]),
                            created_at=now,
                        ))
                    db.commit()
                    _log.info("Bull scan completed for user_id=%s — %d candidates", profile_row.user_id, len(result["candidates"]))
                except Exception as e:
                    _log.error("Bull scan failed for user_id=%s: %s", profile_row.user_id, e)
        finally:
            db.close()

    scheduler = AsyncIOScheduler(timezone=pytz.timezone("America/New_York"))
    scheduler.add_job(_run_scheduled_bull_scan, "cron", day_of_week="mon-fri", hour=17, minute=0)
    scheduler.start()
    _log.info("Bull scan scheduler started — runs weekdays at 5 PM ET")

    yield

    scheduler.shutdown(wait=False)


def _resolve_me_status(email: str, db: Session) -> dict:
    from backend.models import AccessRequest
    from backend.auth import ADMIN_EMAIL, ALLOWED_EMAILS
    if email == ADMIN_EMAIL:
        return {"email": email, "status": "admin", "name": ""}
    if email in ALLOWED_EMAILS:
        return {"email": email, "status": "active", "name": ""}
    req = db.query(AccessRequest).filter(AccessRequest.email == email).first()
    if req is None:
        return {"email": email, "status": "pending", "name": ""}
    name = req.name or ""
    if req.status == "approved":
        return {"email": email, "status": "active", "name": name}
    return {"email": email, "status": req.status, "name": name}


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
app.include_router(admin_router.router)
app.include_router(bull_router.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/debug/routes")
def debug_routes():
    return [{"path": getattr(r, "path", str(r)), "methods": sorted(getattr(r, "methods", None) or [])} for r in app.routes]


@app.get("/api/me")
def get_me(request: Request, db: Session = Depends(get_db)):
    from backend.auth import DEV_BYPASS_AUTH
    if DEV_BYPASS_AUTH:
        return {"email": "dev@example.com", "status": "admin", "name": "Dev User"}
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _resolve_me_status(email, db)


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
