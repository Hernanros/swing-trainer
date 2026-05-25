import sqlite3
import pathlib

db_path = pathlib.Path(__file__).parent.parent / "swing-trainer.db"

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(trades)")
existing_cols = {row[1] for row in cursor.fetchall()}

if "trade_date" not in existing_cols:
    conn.execute("ALTER TABLE trades ADD COLUMN trade_date TEXT")
    conn.commit()
    print("Migration complete: trade_date column added.")
else:
    print("Already migrated: trade_date column already exists.")

conn.close()
