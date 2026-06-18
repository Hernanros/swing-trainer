import math
import os
from abc import ABC, abstractmethod
from datetime import date, timedelta
from typing import Optional


class OptionsProvider(ABC):
    @abstractmethod
    def get_nearest_weekly_expiry(self, symbol: str) -> Optional[str]:
        """Returns nearest expiry with 5-14 DTE as YYYY-MM-DD, or None."""

    @abstractmethod
    def get_chain(self, symbol: str, expiry: str) -> dict:
        """Returns {strikes: [...], puts: [{strike, bid, ask, oi, iv}]}"""


class YFinanceOptionsProvider(OptionsProvider):
    def get_nearest_weekly_expiry(self, symbol: str) -> Optional[str]:
        try:
            import yfinance as yf
            ticker = yf.Ticker(symbol)
            today = date.today()
            min_exp = today + timedelta(days=5)
            max_exp = today + timedelta(days=14)
            for exp_str in (ticker.options or []):
                exp = date.fromisoformat(exp_str)
                if min_exp <= exp <= max_exp:
                    return exp_str
            return None
        except Exception:
            return None

    def get_chain(self, symbol: str, expiry: str) -> dict:
        try:
            import yfinance as yf
            ticker = yf.Ticker(symbol)
            chain = ticker.option_chain(expiry)
            puts = chain.puts
            if puts.empty:
                return {"strikes": [], "puts": []}
            hist = ticker.history(period="2d")
            stock_price = float(hist["Close"].iloc[-1]) if not hist.empty else 0.0
            days_to_expiry = max((date.fromisoformat(expiry) - date.today()).days, 1)
            T = days_to_expiry / 365
            result_puts = []
            for _, row in puts.iterrows():
                strike = float(row["strike"])
                bid = float(row.get("bid") or 0)
                ask = float(row.get("ask") or 0)
                oi = int(row.get("openInterest") or 0)
                iv_raw = float(row.get("impliedVolatility") or 0)
                if iv_raw == 0 or math.isnan(iv_raw):
                    mid = (bid + ask) / 2
                    if stock_price > 0 and T > 0 and mid > 0:
                        iv_raw = (mid / stock_price) * math.sqrt(2 * math.pi / T)
                    else:
                        iv_raw = 0.0
                result_puts.append({
                    "strike": strike,
                    "bid": round(bid, 2),
                    "ask": round(ask, 2),
                    "oi": oi,
                    "iv": round(min(iv_raw, 5.0), 3),
                })
            return {"strikes": sorted(puts["strike"].tolist()), "puts": result_puts}
        except Exception:
            return {"strikes": [], "puts": []}


class TradierOptionsProvider(OptionsProvider):
    def get_nearest_weekly_expiry(self, symbol: str) -> Optional[str]:
        raise NotImplementedError(
            "TradierOptionsProvider not implemented. "
            "Unset TRADIER_API_KEY to fall back to YFinanceOptionsProvider."
        )

    def get_chain(self, symbol: str, expiry: str) -> dict:
        raise NotImplementedError("TradierOptionsProvider not implemented.")


def get_options_provider() -> OptionsProvider:
    if os.getenv("TRADIER_API_KEY"):
        return TradierOptionsProvider()
    return YFinanceOptionsProvider()
