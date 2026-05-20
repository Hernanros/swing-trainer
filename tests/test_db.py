from sqlalchemy import text


def test_engine_connects():
    from backend.database import engine
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        assert result.scalar() == 1


def test_tables_created():
    from backend.database import engine, Base
    import backend.models  # noqa: F401 — registers models
    Base.metadata.create_all(bind=engine)
    from sqlalchemy import inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    for name in ["users", "trades", "checklist_logs", "playbook_rules",
                 "watchlist", "skill_scores", "drill_results",
                 "module_progress", "ai_patterns", "cached_content"]:
        assert name in tables, f"missing table: {name}"
