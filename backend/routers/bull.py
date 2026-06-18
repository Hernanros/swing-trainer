import json
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import User, BullProfile, BullScan, PlaybookRule
from backend.schemas import BullProfileCreate, BullProfileResponse, BullChatRequest
import backend.services.bull as bull_svc
from backend.services.data import get_options_provider

router = APIRouter(prefix="/bull", tags=["bull"])


@router.get("/assistant-playbook")
def get_assistant_playbook():
    return {"rules": bull_svc.BULL_ASSISTANT_PLAYBOOK}


@router.get("/profile", response_model=BullProfileResponse)
def get_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(BullProfile).filter(BullProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not set")
    return BullProfileResponse(
        account_size=profile.account_size,
        risk_per_trade_pct=profile.risk_per_trade_pct,
        max_contracts=profile.max_contracts,
        updated_at=profile.updated_at,
    )


@router.put("/profile", response_model=BullProfileResponse)
def upsert_profile(
    body: BullProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(BullProfile).filter(BullProfile.user_id == current_user.id).first()
    now = datetime.now(timezone.utc).isoformat()
    if profile:
        profile.account_size = body.account_size
        profile.risk_per_trade_pct = body.risk_per_trade_pct
        profile.max_contracts = body.max_contracts
        profile.updated_at = now
    else:
        profile = BullProfile(
            user_id=current_user.id,
            account_size=body.account_size,
            risk_per_trade_pct=body.risk_per_trade_pct,
            max_contracts=body.max_contracts,
            updated_at=now,
        )
        db.add(profile)
    db.commit()
    db.refresh(profile)
    return BullProfileResponse(
        account_size=profile.account_size,
        risk_per_trade_pct=profile.risk_per_trade_pct,
        max_contracts=profile.max_contracts,
        updated_at=profile.updated_at,
    )


@router.get("/scan/latest")
def get_latest_scan(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scan = (
        db.query(BullScan)
        .filter(BullScan.user_id == current_user.id)
        .order_by(BullScan.scan_date.desc())
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="No scan available yet")
    return {
        "scan_date": scan.scan_date,
        "macro": json.loads(scan.macro_json or "{}"),
        "sectors": json.loads(scan.sectors_json or "[]"),
        "candidates": json.loads(scan.results_json or "[]"),
        "created_at": scan.created_at,
    }


@router.post("/scan/run")
def run_scan(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(BullProfile).filter(BullProfile.user_id == current_user.id).first()
    profile_dict = {
        "account_size": profile.account_size if profile else 0,
        "risk_per_trade_pct": profile.risk_per_trade_pct if profile else 1.0,
        "max_contracts": profile.max_contracts if profile else 5,
    }
    rules = [r.text for r in db.query(PlaybookRule).filter_by(user_id=current_user.id).all()]
    try:
        result = bull_svc.run_pipeline(
            options_provider=get_options_provider(),
            playbook_rules=rules,
            bull_profile=profile_dict,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan failed: {e}")
    today = date.today().isoformat()
    now = datetime.now(timezone.utc)
    existing = db.query(BullScan).filter_by(user_id=current_user.id, scan_date=today).first()
    if existing:
        existing.macro_json = json.dumps(result["macro"])
        existing.sectors_json = json.dumps(result["sectors"])
        existing.results_json = json.dumps(result["candidates"])
        existing.created_at = now.isoformat()
        scan_obj = existing
    else:
        scan_obj = BullScan(
            user_id=current_user.id,
            scan_date=today,
            macro_json=json.dumps(result["macro"]),
            sectors_json=json.dumps(result["sectors"]),
            results_json=json.dumps(result["candidates"]),
            created_at=now.isoformat(),
        )
        db.add(scan_obj)
        db.flush()
    # Auto-log paper trades for complete candidates scoring >= 60
    from backend.models import PaperBullTrade
    macro = result.get("macro", {})
    spy_r = (macro.get("spy") or {}).get("regime", "neutral")
    qqq_r = (macro.get("qqq") or {}).get("regime", "neutral")
    macro_regime = "bullish" if spy_r == "bullish" and qqq_r == "bullish" else "neutral"
    for c in result["candidates"]:
        if c.get("data_quality") == "complete" and (c.get("score") or 0) >= 60:
            db.add(PaperBullTrade(
                user_id=current_user.id,
                scan_id=scan_obj.id,
                symbol=c["symbol"],
                logged_at=now,
                expiry=c.get("expiry", ""),
                short_strike=float(c.get("short_strike") or 0),
                long_strike=float(c.get("long_strike") or 0),
                premium_credit=float(c.get("estimated_credit") or 0),
                score=int(c.get("score") or 0),
                data_quality=c.get("data_quality", "complete"),
                channel_proximity=c.get("channel_proximity_pct"),
                rsi_slope=c.get("rsi_slope"),
                macro_regime=macro_regime,
                auto_logged=True,
            ))
    db.commit()
    return {"scan_date": today, "candidates_count": len(result["candidates"]), "created_at": now.isoformat()}


@router.post("/seed-playbook")
def seed_playbook(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(PlaybookRule).filter_by(user_id=current_user.id, setup_type="bull_put_spread").first()
    if existing:
        return {"already_seeded": True, "setup_type": "bull_put_spread"}
    for i, rule_text in enumerate(bull_svc.BULL_ASSISTANT_PLAYBOOK):
        db.add(PlaybookRule(
            user_id=current_user.id,
            setup_type="bull_put_spread",
            text=rule_text,
            tier="must",
            active=True,
            position=i,
        ))
    db.commit()
    return {"already_seeded": False, "setup_type": "bull_put_spread", "created": len(bull_svc.BULL_ASSISTANT_PLAYBOOK)}


@router.get("/kpis")
def get_kpis(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from backend.models import PaperBullTrade
    from sqlalchemy import func
    resolved = (
        db.query(PaperBullTrade)
        .filter(PaperBullTrade.user_id == current_user.id, PaperBullTrade.outcome.in_(["win", "loss"]))
        .all()
    )
    open_count = (
        db.query(func.count(PaperBullTrade.id))
        .filter(PaperBullTrade.user_id == current_user.id, PaperBullTrade.outcome.is_(None))
        .scalar()
    ) or 0
    if not resolved:
        return {"total_trades": 0, "open_trades": open_count, "win_rate": 0, "expectancy_per_dollar": 0, "total_pnl": 0, "score_edge": {"high": {"threshold": 80, "win_rate": 0, "count": 0}, "mid": {"threshold": 60, "win_rate": 0, "count": 0}, "low": {"threshold": 0, "win_rate": 0, "count": 0}}}
    total = len(resolved)
    wins = [t for t in resolved if t.outcome == "win"]
    win_rate = round(len(wins) / total, 3)
    total_pnl = round(sum(t.pnl or 0 for t in resolved), 2)
    total_risk = sum(
        max((t.short_strike - t.long_strike - (t.premium_credit or 0)) * 100, 0.01)
        for t in resolved
    )
    expectancy = round(total_pnl / total_risk, 3) if total_risk > 0 else 0.0

    def _band(lo, hi):
        band = [t for t in resolved if lo <= (t.score or 0) < hi]
        w = sum(1 for t in band if t.outcome == "win")
        return {"threshold": lo, "win_rate": round(w / len(band), 3) if band else 0, "count": len(band)}

    return {
        "total_trades": total,
        "open_trades": open_count,
        "win_rate": win_rate,
        "expectancy_per_dollar": expectancy,
        "total_pnl": total_pnl,
        "score_edge": {"high": _band(80, 101), "mid": _band(60, 80), "low": _band(0, 60)},
    }


@router.get("/paper-trades")
def get_paper_trades(
    page: int = 1,
    per_page: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from backend.models import PaperBullTrade
    from sqlalchemy import func
    total = (
        db.query(func.count(PaperBullTrade.id))
        .filter(PaperBullTrade.user_id == current_user.id)
        .scalar()
    ) or 0
    trades = (
        db.query(PaperBullTrade)
        .filter(PaperBullTrade.user_id == current_user.id)
        .order_by(PaperBullTrade.logged_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "trades": [
            {
                "id": t.id,
                "symbol": t.symbol,
                "logged_at": t.logged_at.isoformat() if t.logged_at else None,
                "expiry": t.expiry,
                "short_strike": t.short_strike,
                "long_strike": t.long_strike,
                "premium_credit": t.premium_credit,
                "score": t.score,
                "data_quality": t.data_quality,
                "outcome": t.outcome,
                "pnl": t.pnl,
                "auto_logged": t.auto_logged,
            }
            for t in trades
        ],
    }


@router.post("/chat")
def bull_chat(
    body: BullChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scan = (
        db.query(BullScan)
        .filter(BullScan.user_id == current_user.id)
        .order_by(BullScan.scan_date.desc())
        .first()
    )
    scan_context = {
        "macro": json.loads(scan.macro_json or "{}") if scan else {},
        "sectors": json.loads(scan.sectors_json or "[]") if scan else [],
        "top_candidates": json.loads(scan.results_json or "[]")[:10] if scan else [],
    }
    answer = bull_svc.chat(
        question=body.question,
        scan_context=scan_context,
        context_symbol=body.context_symbol,
    )
    return {"answer": answer}
