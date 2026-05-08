def test_engine_connects():
    from backend.database import engine
    with engine.connect() as conn:
        assert conn is not None
