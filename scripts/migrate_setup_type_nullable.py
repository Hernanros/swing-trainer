"""
Migration: make trades.setup_type nullable.

SQLite doesn't support ALTER COLUMN, so we recreate the table.
Safe to run multiple times (checks if already nullable).
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import sqlite3
from backend.database import DATABASE_URL

db_path = DATABASE_URL.replace("sqlite:///", "").replace("sqlite://", "")
print(f"Database: {db_path}")

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Check current schema
cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='trades'")
row = cur.fetchone()
if not row:
    print("trades table not found — nothing to do")
    conn.close()
    sys.exit(0)

schema = row[0]
if "setup_type VARCHAR NOT NULL" not in schema and "setup_type VARCHAR NOT NULL" not in schema:
    print("setup_type already nullable — nothing to do")
    conn.close()
    sys.exit(0)

print("Migrating setup_type to nullable...")

cur.executescript("""
PRAGMA foreign_keys = OFF;

CREATE TABLE trades_new (
    id INTEGER NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    symbol VARCHAR NOT NULL,
    date VARCHAR NOT NULL,
    direction VARCHAR NOT NULL,
    setup_type VARCHAR,
    entry FLOAT NOT NULL,
    stop FLOAT NOT NULL,
    target FLOAT NOT NULL,
    exit FLOAT,
    shares INTEGER NOT NULL,
    status VARCHAR,
    practice BOOLEAN,
    pre_note TEXT,
    debrief TEXT,
    checklist_score FLOAT,
    pnl FLOAT,
    r_multiple FLOAT,
    ai_debrief TEXT,
    trade_date TEXT,
    created_at DATETIME
);

INSERT INTO trades_new SELECT
    id, user_id, symbol, date, direction, setup_type, entry, stop, target,
    exit, shares, status, practice, pre_note, debrief, checklist_score, pnl,
    r_multiple, ai_debrief, trade_date, created_at
FROM trades;

DROP TABLE trades;
ALTER TABLE trades_new RENAME TO trades;

PRAGMA foreign_keys = ON;
""")

conn.commit()
conn.close()
print("Done. setup_type is now nullable.")
