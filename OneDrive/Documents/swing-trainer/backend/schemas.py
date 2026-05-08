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

# Drills per day by time budget
DRILLS_PER_DAY = {"15min": 1, "30min": 2, "60min": 3}


class UserCreate(BaseModel):
    name: str
    trading_stage: str
    time_budget: str
    active_skills: List[str]

    model_config = {"str_strip_whitespace": True}


class UserUpdate(BaseModel):
    name: Optional[str] = None
    trading_stage: Optional[str] = None
    time_budget: Optional[str] = None
    active_skills: Optional[List[str]] = None


class UserResponse(BaseModel):
    id: int
    name: str
    trading_stage: str
    time_budget: str
    active_skills: List[str]
    created_at: datetime

    model_config = {"from_attributes": True}
