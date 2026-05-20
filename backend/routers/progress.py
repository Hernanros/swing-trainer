from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import Trade, User

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_trades = db.query(Trade).filter(Trade.user_id == current_user.id).all()
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
