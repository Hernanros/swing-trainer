from backend.schemas import UserCreate, VALID_SKILLS, VALID_DRILL_KEYS

def test_user_create_strips_whitespace():
    u = UserCreate(
        name="  Hernan  ",
        trading_stage="small_money",
        time_budget="30min",
        active_skills=["chart_reading", "entry_timing"],
    )
    assert u.name == "Hernan"

def test_valid_skills_list_is_complete():
    assert len(VALID_SKILLS) == 10
    assert "emotional_discipline" in VALID_SKILLS
    assert "trade_management" in VALID_SKILLS

def test_options_setups_in_valid_drill_keys():
    assert "options_setups" in VALID_DRILL_KEYS, (
        "'options_setups' must be in VALID_DRILL_KEYS so the AI drill endpoint accepts it without 400"
    )

def test_options_setups_not_in_valid_skills():
    assert "options_setups" not in VALID_SKILLS, (
        "'options_setups' is a drill key only (per D-03); it must NOT be added to VALID_SKILLS"
    )
