from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

VALID_SKILLS = [
    "chart_reading",
    "entry_timing",
    "risk_sizing",
    "setup_selection",
    "trade_management",
    "emotional_discipline",
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
    direction: str          # "long" | "short"
    entry_price: float
    stop_price: float
    target_price: float
    shares: int
    pre_note: str = ""

    model_config = {"str_strip_whitespace": True}


class TradeClose(BaseModel):
    exit_price: float
    debrief: str

    model_config = {"str_strip_whitespace": True}


class TradeResponse(BaseModel):
    id: int
    symbol: str
    direction: str
    entry_price: float
    stop_price: float
    target_price: float
    exit_price: Optional[float]
    shares: int
    status: str
    pre_note: str
    debrief: str
    pnl: Optional[float]
    r_multiple: Optional[float]
    created_at: datetime
