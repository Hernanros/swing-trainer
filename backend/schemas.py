from pydantic import BaseModel, field_validator
from typing import List, Optional
from datetime import datetime
import json

VALID_SKILLS = [
    "chart_reading",
    "entry_timing",
    "risk_sizing",
    "setup_selection",
    "trade_management",
    "emotional_discipline",
    "technical_indicators",
    "market_internals",
    "short_selling",
    "gap_trading",
]

VALID_DRILL_KEYS = [
    "setup_selection",
    "entry_timing",
    "trade_management",
    "emotional_discipline",
    "chart_reading",
    "chart_patterns",
    "support_resistance",
    "channels",
    "technical_indicators",
    "market_internals",
    "short_selling",
    "gap_trading",
    "options_setups",
]

VALID_STAGES = ["learning", "small_money", "active"]
VALID_TIME_BUDGETS = ["15min", "30min", "60min"]

DRILLS_PER_DAY = {"15min": 1, "30min": 2, "60min": 3}


class UserCreate(BaseModel):
    name: str
    trading_stage: str
    time_budget: str
    active_skills: List[str]
    email: Optional[str] = None

    model_config = {"str_strip_whitespace": True}


class UserUpdate(BaseModel):
    name: Optional[str] = None
    trading_stage: Optional[str] = None
    time_budget: Optional[str] = None
    active_skills: Optional[List[str]] = None

    model_config = {"str_strip_whitespace": True}


class UserResponse(BaseModel):
    id: int
    name: str
    trading_stage: str
    time_budget: str
    active_skills: List[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class TradeCreate(BaseModel):
    symbol: str
    direction: Optional[str] = None   # "long" | "short" (omitted for option_spread)
    entry_price: float
    stop_price: float
    target_price: float
    shares: int
    pre_note: str = ""
    setup_type: Optional[str] = None
    practice: bool = False
    checklist_score: Optional[float] = None  # 0.0–100.0
    trade_date: Optional[str] = None         # YYYY-MM-DD; defaults to today if omitted
    trade_type:          str            = "equity"
    option_expiry:       Optional[str]  = None
    option_long_strike:  Optional[float]= None
    option_short_strike: Optional[float]= None
    option_spread_type:  Optional[str]  = None

    model_config = {"str_strip_whitespace": True}


class TradeClose(BaseModel):
    exit_price: float
    debrief: str
    checklist_items: list[dict] = []

    model_config = {"str_strip_whitespace": True}


class TradeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    symbol: str
    direction: Optional[str] = None
    entry_price: float
    stop_price: float
    target_price: float
    exit_price: Optional[float]
    shares: int
    status: str
    pre_note: str
    debrief: str
    setup_type: Optional[str]
    practice: bool
    checklist_score: Optional[float]
    pnl: Optional[float]
    r_multiple: Optional[float]
    ai_debrief: Optional[str]
    created_at: datetime
    trade_date: Optional[str] = None
    trade_type:          str            = "equity"
    option_expiry:       Optional[str]  = None
    option_long_strike:  Optional[float]= None
    option_short_strike: Optional[float]= None
    option_spread_type:  Optional[str]  = None
    max_profit:          Optional[float]= None
    max_loss:            Optional[float]= None
    breakeven:           Optional[float]= None
    closed_count: Optional[int] = None


VALID_TIERS = {"must", "should", "context"}


class PlaybookRuleCreate(BaseModel):
    setup_type: str
    text: str
    tier: str        # "must" | "should" | "context"
    position: int = 0

    model_config = {"str_strip_whitespace": True}


class PlaybookRuleUpdate(BaseModel):
    text: Optional[str] = None
    tier: Optional[str] = None
    position: Optional[int] = None
    active: Optional[bool] = None


class PlaybookRuleResponse(BaseModel):
    id: int
    setup_type: str
    text: str
    tier: str
    position: int
    active: bool

    model_config = {"from_attributes": True}


class WatchlistItemCreate(BaseModel):
    symbol: str
    notes: str = ""
    tags: List[str] = []
    model_config = {"str_strip_whitespace": True}

class WatchlistItemUpdate(BaseModel):
    notes: str = ""

class WatchlistTagsUpdate(BaseModel):
    tags: List[str]
    model_config = {"str_strip_whitespace": True}

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v):
        if len(v) > 20:
            raise ValueError("Cannot add more than 20 tags")
        for tag in v:
            if len(tag) > 50:
                raise ValueError(f"Tag '{tag[:20]}...' exceeds 50 character limit")
        return v

class WatchlistItemResponse(BaseModel):
    id: int
    symbol: str
    notes: str
    tags: List[str] = []
    added_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v or []


class RiskCalcSubmit(BaseModel):
    account_size: float
    risk_pct: float
    entry: float
    stop: float
    user_answer: int
