import sqlite3
from pathlib import Path
from contextlib import contextmanager

from .config import settings

DB_PATH: Path = settings.db_path

def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn

@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    type        TEXT NOT NULL CHECK(type IN ('liquid', 'financial', 'credit')),
    sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expense_categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS income_sources (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    description TEXT,
    category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    account_id  INTEGER NOT NULL REFERENCES accounts(id),
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS income (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    description TEXT,
    source_id   INTEGER NOT NULL REFERENCES income_sources(id),
    account_id  INTEGER NOT NULL REFERENCES accounts(id),
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transfers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT NOT NULL,
    amount          INTEGER NOT NULL,
    fees            INTEGER NOT NULL DEFAULT 0,
    description     TEXT,
    from_account_id INTEGER NOT NULL REFERENCES accounts(id),
    to_account_id   INTEGER NOT NULL REFERENCES accounts(id),
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account_rollovers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id  INTEGER NOT NULL REFERENCES accounts(id),
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL,
    amount      INTEGER NOT NULL DEFAULT 0,
    UNIQUE(account_id, year, month)
);

CREATE TABLE IF NOT EXISTS budget_expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL,
    planned     INTEGER NOT NULL DEFAULT 0,
    UNIQUE(category_id, year, month)
);

CREATE TABLE IF NOT EXISTS budget_income (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id   INTEGER NOT NULL REFERENCES income_sources(id),
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL,
    planned     INTEGER NOT NULL DEFAULT 0,
    UNIQUE(source_id, year, month)
);
"""

ACCOUNTS = [
    ("Cash",       "liquid",    1),
    ("MTN",        "liquid",    2),
    ("Airtel",     "liquid",    3),
    ("Coins",      "liquid",    4),
    ("Mokash",     "liquid",    5),
    ("Sanlam",     "financial", 6),
    ("UAP RM",     "financial", 7),
    ("Xeno",       "financial", 8),
    ("Centenary",  "financial", 9),
    ("Equity",     "financial", 10),
    ("Credit",     "credit",    11),
]

CATEGORIES = [
    ("Fees",           1),
    ("Rent",           2),
    ("Transportation", 3),
    ("Food",           4),
    ("Clothes",        5),
    ("Personal",       6),
    ("Household",      7),
    ("Health/medical", 8),
    ("Faith",          9),
    ("Gifts",          10),
    ("Phone Bills",    11),
    ("Utilities",      12),
    ("Rotaract",       13),
    ("Gig costs",      14),
    ("Untracked",      15),
    ("Farming",        16),
]

SOURCES = [
    ("Salo",     1),
    ("Hustle",   2),
    ("Family",   3),
    ("Interest", 4),
    ("Other",    5),
    ("Gig",      6),
]

def init_db():
    with get_db() as conn:
        conn.executescript(SCHEMA)
        for name, acc_type, sort_order in ACCOUNTS:
            conn.execute(
                "INSERT OR IGNORE INTO accounts (name, type, sort_order) VALUES (?, ?, ?)",
                (name, acc_type, sort_order),
            )
        for name, sort_order in CATEGORIES:
            conn.execute(
                "INSERT OR IGNORE INTO expense_categories (name, sort_order) VALUES (?, ?)",
                (name, sort_order),
            )
        for name, sort_order in SOURCES:
            conn.execute(
                "INSERT OR IGNORE INTO income_sources (name, sort_order) VALUES (?, ?)",
                (name, sort_order),
            )
