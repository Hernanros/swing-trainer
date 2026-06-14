import os
from typing import Optional


class OptionsDataProvider:
    def get_options_snapshot(self, symbol: str) -> Optional[dict]:
        """
        Returns dict with keys: iv, ivr, atm_oi, atm_spread_pct, nearest_expiry, atm_strike
        Returns None if data is unavailable for this symbol.
        """
        raise NotImplementedError


class YFinanceOptionsProvider(OptionsDataProvider):
    """
    Free options data via yfinance (unofficial Yahoo Finance).
    iv field is the ATM implied volatility (not true IVR — yfinance lacks 52-week IV history).
    Swap for TradierOptionsProvider when TRADIER_API_KEY is available for proper IVR.
    """

    def get_options_snapshot(self, symbol: str) -> Optional[dict]:
        try:
            import yfinance as yf
            ticker = yf.Ticker(symbol)
            expirations = ticker.options
            if not expirations:
                return None
            expiry = expirations[0]
            chain = ticker.option_chain(expiry)
            puts = chain.puts
            if puts.empty:
                return None
            hist = ticker.history(period="2d")
            if hist.empty:
                return None
            current_price = float(hist["Close"].iloc[-1])
            puts = puts.copy()
            puts["_dist"] = (puts["strike"] - current_price).abs()
            atm_put = puts.nsmallest(1, "_dist").iloc[0]
            iv = float(atm_put.get("impliedVolatility", 0) or 0)
            oi = int(atm_put.get("openInterest", 0) or 0)
            bid = float(atm_put.get("bid", 0) or 0)
            ask = float(atm_put.get("ask", 0) or 0)
            mid = (bid + ask) / 2
            # bid=0 is common in yfinance (stale quote); treat as data-unavailable, not wide spread
            spread_pct = round((ask - bid) / mid, 3) if (mid > 0 and bid > 0) else 0.0
            return {
                "iv": round(iv, 3),
                "ivr": round(iv * 100, 1),   # proxy: IV% as IVR until Tradier wired
                "atm_oi": oi,
                "atm_spread_pct": spread_pct,
                "nearest_expiry": expiry,
                "atm_strike": float(atm_put["strike"]),
            }
        except Exception:
            return None


class TradierOptionsProvider(OptionsDataProvider):
    """Stub — implement when TRADIER_API_KEY is available."""

    def get_options_snapshot(self, symbol: str) -> Optional[dict]:
        raise NotImplementedError(
            "TradierOptionsProvider not implemented. "
            "Unset TRADIER_API_KEY to fall back to YFinanceOptionsProvider."
        )


def get_options_provider() -> OptionsDataProvider:
    if os.getenv("TRADIER_API_KEY"):
        return TradierOptionsProvider()
    return YFinanceOptionsProvider()
