import logging
from fastapi import APIRouter, HTTPException, Query
from backend.services.market import get_quote, get_candles

router = APIRouter(prefix="/market", tags=["market"])
_log = logging.getLogger(__name__)


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
def candles(symbol: str, days: int = Query(default=60, ge=5, le=365)):
    try:
        return get_candles(symbol.upper(), range_days=days)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        _log.exception("Candles fetch failed for %s", symbol)
        raise HTTPException(503, f"Candle data unavailable for {symbol}: {e}")
