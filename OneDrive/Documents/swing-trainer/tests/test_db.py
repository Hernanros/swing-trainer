from sqlalchemy import text


def test_engine_connects():
    from backend.database import engine
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        assert result.scalar() == 1
