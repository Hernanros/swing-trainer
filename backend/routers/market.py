import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import CachedContent
from backend.services.market import get_quote, get_candles, get_next_earnings

router = APIRouter(prefix="/market", tags=["market"])
_log = logging.getLogger(__name__)

# Trailing edge of the candle window is `trade_date + 10` (see services/market._fetch_candles).
# Cache that window briefly so today's close updates; cache fully historical windows long.
_CANDLE_TRAILING_EDGE_DAYS = 10
_CANDLE_TTL_RECENT = 60 * 60        # 1h while the window still reaches into the present
_CANDLE_TTL_HISTORICAL = 30 * 86400  # 30d once the window is fully in the past


@router.get("/quote/{symbol}")
def quote(symbol: str):
    try:
        return get_quote(symbol.upper())
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        _log.exception("Quote fetch failed for %s", symbol)
        raise HTTPException(503, f"Quote service unavailable for {symbol}: {e}")


@router.get("/candles/{symbol}")
def candles(
    symbol: str,
    days: int = Query(default=60, ge=5, le=365),
    date: Optional[str] = Query(default=None, description="Trade date anchor YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    symbol = symbol.upper()
    if date:
        cache_key = f"candles:{symbol}:{date}:{days}"
        now = datetime.now(timezone.utc)
        try:
            trade_dt = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "date must be YYYY-MM-DD")
        trailing_edge = trade_dt + timedelta(days=_CANDLE_TRAILING_EDGE_DAYS)
        ttl = _CANDLE_TTL_RECENT if trailing_edge >= now else _CANDLE_TTL_HISTORICAL
        row = db.query(CachedContent).filter(CachedContent.key == cache_key).first()
        if row:
            age = (now - row.generated_at.replace(tzinfo=timezone.utc)).total_seconds()
            if 0 <= age < ttl:
                return json.loads(row.content)
        try:
            result = get_candles(symbol, days, date=date)
        except ValueError as e:
            raise HTTPException(404, str(e))
        except Exception as e:
            _log.exception("Historical candles fetch failed for %s date=%s", symbol, date)
            raise HTTPException(503, f"Candle data unavailable for {symbol}: {e}")
        content = json.dumps(result)
        if row:
            row.content = content
            row.generated_at = now
        else:
            db.add(CachedContent(key=cache_key, content=content, generated_at=now))
        db.commit()
        return result

    try:
        return get_candles(symbol, range_days=days)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        _log.exception("Candles fetch failed for %s", symbol)
        raise HTTPException(503, f"Candle data unavailable for {symbol}: {e}")


@router.get("/earnings/{symbol}")
def earnings(symbol: str, db: Session = Depends(get_db)):
    symbol = symbol.upper()
    cache_key = f"earnings:{symbol}"
    now = datetime.now(timezone.utc)
    row = db.query(CachedContent).filter(CachedContent.key == cache_key).first()
    if row:
        age = (now - row.generated_at.replace(tzinfo=timezone.utc)).total_seconds()
        if 0 <= age < 86400:
            return json.loads(row.content)
    try:
        result = get_next_earnings(symbol)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        _log.exception("Earnings fetch failed for %s", symbol)
        raise HTTPException(503, f"Earnings unavailable for {symbol}: {e}")
    content = json.dumps(result)
    if row:
        row.content = content
        row.generated_at = now
    else:
        db.add(CachedContent(key=cache_key, content=content, generated_at=now))
    db.commit()
    return result
