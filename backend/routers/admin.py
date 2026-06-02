from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from backend.auth import get_admin_user, get_db
from backend.models import AccessRequest
from backend.services.email import send_approval_notification

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _serialize(req: AccessRequest) -> dict:
    return {
        "id": req.id,
        "email": req.email,
        "name": req.name,
        "status": req.status,
        "requested_at": req.requested_at.isoformat() if req.requested_at else None,
        "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None,
    }


@router.get("/requests", dependencies=[Depends(get_admin_user)])
def list_requests(db: Session = Depends(get_db)):
    all_requests = (
        db.query(AccessRequest)
        .order_by(AccessRequest.requested_at.desc())
        .all()
    )
    grouped: dict[str, list] = {"pending": [], "approved": [], "rejected": []}
    for req in all_requests:
        bucket = req.status if req.status in grouped else "pending"
        grouped[bucket].append(_serialize(req))
    return grouped


@router.post("/requests/{id}/approve", dependencies=[Depends(get_admin_user)])
def approve_request(id: int, db: Session = Depends(get_db)):
    req = db.query(AccessRequest).filter(AccessRequest.id == id).first()
    if req is None:
        raise HTTPException(status_code=404, detail="Access request not found")
    req.status = "approved"
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    send_approval_notification(req.email)
    return _serialize(req)


@router.post("/requests/{id}/reject", dependencies=[Depends(get_admin_user)])
def reject_request(id: int, db: Session = Depends(get_db)):
    req = db.query(AccessRequest).filter(AccessRequest.id == id).first()
    if req is None:
        raise HTTPException(status_code=404, detail="Access request not found")
    req.status = "rejected"
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return _serialize(req)
