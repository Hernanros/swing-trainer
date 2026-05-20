from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.auth import get_current_user
from backend.models import WatchlistItem, User
from backend.schemas import WatchlistItemCreate, WatchlistItemUpdate, WatchlistItemResponse

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("/", response_model=list[WatchlistItemResponse])
def list_watchlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == current_user.id)
        .order_by(WatchlistItem.added_at.desc())
        .all()
    )


@router.post("/", response_model=WatchlistItemResponse, status_code=201)
def add_to_watchlist(
    body: WatchlistItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    symbol = body.symbol.upper().strip()
    existing = db.query(WatchlistItem).filter(
        WatchlistItem.user_id == current_user.id,
        WatchlistItem.symbol == symbol,
    ).first()
    if existing:
        raise HTTPException(409, "Symbol already in watchlist")
    item = WatchlistItem(user_id=current_user.id, symbol=symbol, notes=body.notes)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}/notes", response_model=WatchlistItemResponse)
def update_notes(
    item_id: int,
    body: WatchlistItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(WatchlistItem).filter(
        WatchlistItem.id == item_id,
        WatchlistItem.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(404, "Item not found")
    item.notes = body.notes
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def remove_from_watchlist(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(WatchlistItem).filter(
        WatchlistItem.id == item_id,
        WatchlistItem.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(404, "Item not found")
    db.delete(item)
    db.commit()
    return Response(status_code=204)
