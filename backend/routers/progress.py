import logging
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Trade, User, AIPattern
from backend.services.claude import get_user_coaching_context, generate_pattern_analysis

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_trades = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.practice == False,
    ).all()
    closed = [t for t in all_trades if t.status == "closed"]

    wins = [t for t in closed if t.pnl is not None and t.pnl >= 0]
    win_rate = round(len(wins) / len(closed) * 100, 1) if closed else None

    r_values = [t.r_multiple for t in closed if t.r_multiple is not None]
    avg_r = round(sum(r_values) / len(r_values), 3) if r_values else None

    scores = [t.checklist_score for t in all_trades if t.checklist_score is not None]
    avg_plan_adherence = round(sum(scores) / len(scores), 1) if scores else None

    total_pnl = round(sum(t.pnl for t in closed if t.pnl is not None), 2)

    return {
        "total_trades":       len(all_trades),
        "closed_trades":      len(closed),
        "wins":               len(wins),
        "win_rate":           win_rate,
        "avg_r":              avg_r,
        "avg_plan_adherence": avg_plan_adherence,
        "total_pnl":          total_pnl,
    }


@router.get("/patterns")
def get_patterns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    patterns = (
        db.query(AIPattern)
        .filter(AIPattern.user_id == current_user.id)
        .order_by(AIPattern.detected_at.desc())
        .all()
    )

    closed_count = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.status == "closed",
        Trade.practice == False,
    ).count()

    min_trades_met = closed_count >= 5
    last_analyzed_at = None
    if patterns:
        last_analyzed_at = max(p.detected_at for p in patterns)

    # NOTE: uses Trade.created_at as proxy for close time (no closed_at column).
    # Trades opened before last analysis but closed after it won't trigger can_analyze.
    # Acceptable for the current schema; revisit if closed_at is added to Trade.
    if last_analyzed_at is not None:
        new_trade_count = db.query(Trade).filter(
            Trade.user_id == current_user.id,
            Trade.status == "closed",
            Trade.practice == False,
            Trade.created_at > last_analyzed_at,
        ).count()
        can_analyze = min_trades_met and new_trade_count >= 1
    else:
        can_analyze = min_trades_met

    return {
        "patterns": [
            {
                "id": p.id,
                "pattern_text": p.pattern_text,
                "severity": p.severity,
                "skill": p.skill,
                "detected_at": p.detected_at.isoformat(),
            }
            for p in patterns
        ],
        "last_analyzed_at": last_analyzed_at.isoformat() if last_analyzed_at else None,
        "min_trades_met":   min_trades_met,
        "can_analyze":      can_analyze,
        "trade_range":      "last 20 trades",
    }


@router.post("/analyze-patterns")
def analyze_patterns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    closed_count = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.status == "closed",
        Trade.practice == False,
    ).count()

    if closed_count < 5:
        raise HTTPException(422, "Need at least 5 closed trades to analyze patterns.")

    existing = db.query(AIPattern).filter(AIPattern.user_id == current_user.id).all()
    if existing:
        last_analyzed_at = max(p.detected_at for p in existing)
        new_count = db.query(Trade).filter(
            Trade.user_id == current_user.id,
            Trade.status == "closed",
            Trade.practice == False,
            Trade.created_at > last_analyzed_at,
        ).count()
        if new_count == 0:
            raise HTTPException(429, "No new trades since last analysis.")

    context = get_user_coaching_context(current_user, db)
    try:
        parsed = generate_pattern_analysis(context)
    except Exception:
        _log.exception("Pattern analysis failed for user %s", current_user.id)
        raise HTTPException(503, "Pattern analysis unavailable — try again later.")

    db.query(AIPattern).filter(AIPattern.user_id == current_user.id).delete(synchronize_session=False)
    db.expire_all()
    now = datetime.now(timezone.utc)
    new_rows = []
    for p in parsed:
        row = AIPattern(
            user_id=current_user.id,
            pattern_text=p["pattern_text"],
            severity=p["severity"],
            skill=p.get("skill"),
            detected_at=now,
            trade_range="last 20 trades",
        )
        db.add(row)
        new_rows.append(row)
    db.commit()
    for row in new_rows:
        db.refresh(row)

    return [
        {
            "id": row.id,
            "pattern_text": row.pattern_text,
            "severity": row.severity,
            "skill": row.skill,
            "detected_at": row.detected_at.isoformat(),
        }
        for row in new_rows
    ]


@router.get("/setups")
def get_setup_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trades = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.status == "closed",
        Trade.practice == False,
        Trade.setup_type != None,
        Trade.setup_type != "",
    ).all()

    groups = defaultdict(list)
    for t in trades:
        groups[t.setup_type].append(t)

    result = []
    for setup, ts in sorted(groups.items()):
        wins = [t for t in ts if t.pnl is not None and t.pnl >= 0]
        r_vals = [t.r_multiple for t in ts if t.r_multiple is not None]
        result.append({
            "setup_type": setup,
            "trades":     len(ts),
            "wins":       len(wins),
            "win_rate":   round(len(wins) / len(ts) * 100, 1),
            "avg_r":      round(sum(r_vals) / len(r_vals), 2) if r_vals else None,
        })
    return result
