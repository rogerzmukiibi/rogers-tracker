CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT    NOT NULL,
  amount      INTEGER NOT NULL,
  description TEXT,
  category    TEXT    NOT NULL,
  account     TEXT    NOT NULL,
  month       TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS income (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT    NOT NULL,
  amount      INTEGER NOT NULL,
  description TEXT,
  source      TEXT    NOT NULL,
  account     TEXT    NOT NULL,
  month       TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS transfers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT    NOT NULL,
  amount       INTEGER NOT NULL,
  fees         INTEGER NOT NULL DEFAULT 0,
  description  TEXT,
  from_account TEXT    NOT NULL,
  to_account   TEXT    NOT NULL,
  month        TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL UNIQUE,
  type     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS income_sources (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO accounts (name, type) VALUES
  ('Cash', 'liquid'),
  ('MTN', 'liquid'),
  ('Airtel', 'liquid'),
  ('Coins', 'liquid'),
  ('Mokash', 'liquid'),
  ('Sanlam', 'financial'),
  ('UAP RM', 'financial'),
  ('Xeno', 'financial'),
  ('Centenary', 'financial'),
  ('Equity', 'financial'),
  ('Credit', 'credit');

INSERT OR IGNORE INTO categories (name) VALUES
  ('Fees'), ('Rent'), ('Transportation'), ('Food'), ('Clothes'),
  ('Personal'), ('Household'), ('Health/medical'), ('Faith'), ('Gifts'),
  ('Phone Bills'), ('Utilities'), ('Rotaract'), ('Gig costs'),
  ('Untracked'), ('Farming');

INSERT OR IGNORE INTO income_sources (name) VALUES
  ('Salo'), ('Hustle'), ('Family'), ('Interest'), ('Other'), ('Gig');
