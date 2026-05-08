import pytest
from backend.schemas import UserCreate, VALID_SKILLS

def test_user_create_strips_whitespace():
    u = UserCreate(
        name="  Hernan  ",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=["chart_reading", "entry_timing"],
    )
    assert u.name == "Hernan"

def test_valid_skills_list_is_complete():
    assert len(VALID_SKILLS) == 6
    assert "emotional_discipline" in VALID_SKILLS
    assert "trade_management" in VALID_SKILLS
