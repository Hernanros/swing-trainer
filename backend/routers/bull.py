import json
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import User, BullProfile, BullScan, PlaybookRule
from backend.schemas import BullProfileCreate, BullProfileResponse, BullChatRequest
import backend.services.bull as bull_svc
from backend.services.options import get_options_provider

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
    existing = db.query(BullScan).filter_by(user_id=current_user.id, scan_date=today).first()
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        existing.macro_json = json.dumps(result["macro"])
        existing.sectors_json = json.dumps(result["sectors"])
        existing.results_json = json.dumps(result["candidates"])
        existing.created_at = now
    else:
        db.add(BullScan(
            user_id=current_user.id,
            scan_date=today,
            macro_json=json.dumps(result["macro"]),
            sectors_json=json.dumps(result["sectors"]),
            results_json=json.dumps(result["candidates"]),
            created_at=now,
        ))
    db.commit()
    return {"scan_date": today, "candidates_count": len(result["candidates"]), "created_at": now}


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
