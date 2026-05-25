# CLAUDE.md — Rogers Tracker

This file tells Claude Code what to build, how to build it, and what the business rules are. Read this fully before writing any code.

---

## What This Is

A self-hosted personal finance web app for a user in Kampala, Uganda (currency: UGX — Ugandan Shillings). It replaces a custom Excel workbook. The app runs in Docker, is accessed via a browser, and uses SQLite for storage. No JavaScript frameworks. No build tools. No TypeScript. Keep it simple.

---

## Tech Stack — Do Not Deviate

- **Backend**: Python 3.12, FastAPI, SQLite (via `sqlite3` stdlib — no SQLAlchemy ORM)
- **Frontend**: Plain HTML, Vanilla JS (ES6 modules), Chart.js (loaded from CDN), CSS custom properties
- **Container**: Docker + Docker Compose
- **No**: React, Vue, Node, npm, webpack, TypeScript, SQLAlchemy, Alembic, or any ORM

SQL queries are written by hand using `sqlite3`. Use parameterised queries always (never f-strings in SQL).

---

## File Layout

```
rogers-tracker/
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── data/                    ← mounted as Docker volume, holds tracker.db
├── app/
│   ├── main.py              ← FastAPI app + all route definitions
│   ├── database.py          ← DB connection, schema DDL, seed data
│   ├── models.py            ← Pydantic v2 models for request/response
│   └── logic.py             ← balance calculations, monthly summaries
└── frontend/
    ├── index.html           ← dashboard
    ├── entry.html           ← add expense / income / transfer
    ├── log.html             ← transaction log with filters
    ├── summary.html         ← year summary table
    └── static/
        ├── app.js           ← shared: fetchAPI(), formatUGX(), nav
        ├── dashboard.js
        ├── entry.js
        ├── log.js
        └── style.css
```

---

## Database Schema

Use `sqlite3`. The database file is at `data/tracker.db`. Auto-create on startup via `database.py`.

```sql
-- Reference tables (seeded on first run)

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('liquid', 'financial', 'credit')),
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS income_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0
);

-- Transaction tables

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,          -- ISO 8601: YYYY-MM-DD
    amount INTEGER NOT NULL,     -- UGX, stored as integer (no decimals)
    description TEXT,
    category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    source_id INTEGER NOT NULL REFERENCES income_sources(id),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    fees INTEGER NOT NULL DEFAULT 0,   -- money lost to service provider
    description TEXT,
    from_account_id INTEGER NOT NULL REFERENCES accounts(id),
    to_account_id INTEGER NOT NULL REFERENCES accounts(id),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Monthly account rollover (carried balance from previous month)
CREATE TABLE IF NOT EXISTS account_rollovers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    UNIQUE(account_id, year, month)
);

-- Monthly budgets (planned amounts per category/source)
CREATE TABLE IF NOT EXISTS budget_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    planned INTEGER NOT NULL DEFAULT 0,
    UNIQUE(category_id, year, month)
);

CREATE TABLE IF NOT EXISTS budget_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES income_sources(id),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    planned INTEGER NOT NULL DEFAULT 0,
    UNIQUE(source_id, year, month)
);
```

### Seed Data

Insert these on first run (skip if rows already exist):

**Accounts** (in order):
| name | type |
|---|---|
| Cash | liquid |
| MTN | liquid |
| Airtel | liquid |
| Coins | liquid |
| Mokash | liquid |
| Sanlam | financial |
| UAP RM | financial |
| Xeno | financial |
| Centenary | financial |
| Equity | financial |
| Credit | credit |

**Expense Categories** (in order):
`Fees`, `Rent`, `Transportation`, `Food`, `Clothes`, `Personal`, `Household`, `Health/medical`, `Faith`, `Gifts`, `Phone Bills`, `Utilities`, `Rotaract`, `Gig costs`, `Untracked`, `Farming`

> `Fees` has id=1 and is NEVER directly entered by the user. It is computed from transfers.

**Income Sources** (in order):
`Salo`, `Hustle`, `Family`, `Interest`, `Other`, `Gig`

---

## Business Logic (`logic.py`)

### Account Balance for a Given Month

```python
def get_account_balance(db, account_id, year, month):
    rollover = get_rollover(db, account_id, year, month)
    earned = get_earned(db, account_id, year, month)
    spent = get_spent(db, account_id, year, month)
    return rollover + earned - spent

def get_earned(db, account_id, year, month):
    # income transactions credited to this account
    income = SUM(income WHERE account_id=? AND year/month match)
    # transfers INTO this account (amount only, not fees)
    transfers_in = SUM(transfers WHERE to_account_id=? AND year/month match, amount)
    return income + transfers_in

def get_spent(db, account_id, year, month):
    # expenses paid from this account
    expenses = SUM(expenses WHERE account_id=? AND year/month match)
    # transfers OUT of this account (amount only)
    transfers_out = SUM(transfers WHERE from_account_id=? AND year/month match, amount)
    # fees charged on transfers out of this account
    fees = SUM(transfers WHERE from_account_id=? AND year/month match, fees)
    return expenses + transfers_out + fees
```

Use `strftime('%Y', date) = ? AND strftime('%m', date) = ?` for month/year filtering in SQLite. Pass year as string `'2026'` and month as zero-padded string `'01'`.

### Monthly Expense Summary

```python
def get_expense_summary(db, year, month):
    # For each category (except Fees):
    #   planned = from budget_expenses
    #   actual  = SUM(expenses WHERE category_id=? AND month/year)
    #   diff    = planned - actual
    # Fees row = SUM(transfers.fees WHERE month/year)
```

### Monthly Income Summary

```python
def get_income_summary(db, year, month):
    # For each income source:
    #   planned = from budget_income
    #   actual  = SUM(income WHERE source_id=? AND month/year)
    #   diff    = actual - planned
```

### Net Cash Flow

```python
net = total_income - total_expenses_including_fees
```

---

## API Routes (`main.py`)

All routes return JSON. Amounts are always integers (UGX).

### Reference Data
```
GET  /api/accounts            → list of all accounts
GET  /api/categories          → list of expense categories
GET  /api/sources             → list of income sources
```

### Transactions
```
POST /api/expenses            → create expense
GET  /api/expenses?year=&month=  → list expenses for month
PUT  /api/expenses/{id}       → update expense
DELETE /api/expenses/{id}     → delete expense

POST /api/income              → create income entry
GET  /api/income?year=&month= → list income for month
PUT  /api/income/{id}
DELETE /api/income/{id}

POST /api/transfers           → create transfer
GET  /api/transfers?year=&month=
PUT  /api/transfers/{id}
DELETE /api/transfers/{id}
```

### Dashboard / Summary
```
GET  /api/dashboard?year=&month=
     → {
         expenses: [{category, planned, actual, diff}],
         income:   [{source, planned, actual, diff}],
         accounts: [{account, type, rollover, earned, spent, current}],
         net: int,
         total_expenses: int,
         total_income: int
       }

GET  /api/summary/year?year=
     → monthly breakdown of income and expenses for the full year

GET  /api/log?year=&month=&type=&account=&category=
     → combined transaction log (all types) for filtering
```

### Budget
```
POST /api/budget/expense      → set planned amount for category/month
POST /api/budget/income       → set planned amount for source/month
POST /api/rollover            → set rollover for account/month
```

---

## Pydantic Models (`models.py`)

```python
class ExpenseCreate(BaseModel):
    date: str           # YYYY-MM-DD
    amount: int
    description: str | None = None
    category_id: int
    account_id: int

class IncomeCreate(BaseModel):
    date: str
    amount: int
    description: str | None = None
    source_id: int
    account_id: int

class TransferCreate(BaseModel):
    date: str
    amount: int
    fees: int = 0
    description: str | None = None
    from_account_id: int
    to_account_id: int
```

---

## Frontend Pages

### `index.html` — Dashboard

Header: app name + month/year selector (default: current month).

**Summary cards row** (5 cards):
- Total Expenses (actual vs planned, diff coloured red if over)
- Total Income (actual vs planned)
- Liquid Assets (sum of liquid account balances)
- Financial Assets (sum of financial account balances)
- Net Cash Flow (income - expenses, red if negative)

**Charts row** (2 charts side by side, Chart.js doughnut):
- Expense breakdown by category (actual amounts, exclude zero-value categories)
- Income breakdown by source

**Accounts table**: one row per account showing rollover, earned, spent, current. Group by type (liquid / financial / credit).

**Expense & Income tables**: category-by-category planned vs actual vs diff. Diff cell is red when negative.

### `entry.html` — Add Transaction

Three tabs: **Expense** | **Income** | **Transfer**

Each tab has a form with:
- Date picker (default today)
- Amount field (numeric, large on mobile)
- Description (optional text)
- Category/Source dropdown (populated from API)
- Account dropdown (populated from API)
- For Transfer: From Account, To Account, Fees field
- Submit button

On submit: POST to API, show success message, reset form (keep date and account).

### `log.html` — Transaction Log

Filters: month/year, type (All/Expense/Income/Transfer), account, category/source.

Table: date, type badge, description, category/source, account, amount. Amounts formatted as `UGX X,XXX`.

Click a row to edit (inline or modal). Delete button per row.

### `summary.html` — Year Summary

Two tables side by side:
1. Expenses by category, columns = Jan–Dec + Yearly total + % of total
2. Income by source, columns = Jan–Dec + Yearly total + % of total

Below: account balances table month-by-month.

---

## Shared JS (`app.js`)

```javascript
// Format UGX amounts
function formatUGX(amount) {
    if (amount < 0) return `-UGX ${Math.abs(amount).toLocaleString()}`;
    return `UGX ${amount.toLocaleString()}`;
}

// API helper
async function fetchAPI(path, options = {}) {
    const res = await fetch('/api' + path, {
        headers: {'Content-Type': 'application/json'},
        ...options
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

// Navigation: highlight active page in nav
// Month selector: stored in localStorage as {year, month}
```

---

## Docker Setup

### `Dockerfile`
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
COPY frontend/ ./frontend/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### `docker-compose.yml`
```yaml
services:
  tracker:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### `requirements.txt`
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
pydantic==2.7.0
python-multipart==0.0.9
```

---

## Style Guide (`style.css`)

Use CSS custom properties. Clean, flat design. Mobile-first.

```css
:root {
    --color-bg: #ffffff;
    --color-surface: #f8f7f5;
    --color-border: rgba(0,0,0,0.12);
    --color-text: #1a1a18;
    --color-text-muted: #6b6b67;
    --color-primary: #1D9E75;   /* teal — positive/income */
    --color-danger: #D85A30;    /* coral — negative/overspent */
    --color-warning: #BA7517;   /* amber */
    --color-info: #185FA5;      /* blue */
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
}
```

Nav: top bar with links to all four pages. Active page highlighted.
Cards: white bg, 0.5px border, border-radius-md, 1rem padding.
Tables: clean, no zebra striping, subtle row hover.
Forms: full-width inputs, 44px minimum touch target height.
Amount inputs: larger font size (20px) for fast mobile entry.

---

## Key Behaviour Notes

1. **Fees are never entered as expenses directly.** The `Fees` category row in the expense summary is computed automatically from the `fees` column in the transfers table for that month.

2. **Credit account** has a typically negative balance (money owed). Display it clearly. In the liquid assets total, do NOT include the Credit account. Show it separately in a Debt section.

3. **Rollover values** must be set manually by the user each month (or auto-carried from previous month's closing balance). The API should allow setting rollover via `POST /api/rollover`.

4. **UGX amounts** are always integers. No decimals. Store as INTEGER in SQLite. Display with `toLocaleString()` e.g. `UGX 100,000`.

5. **Date filtering** in SQLite: use `strftime('%Y', date) = '2026' AND strftime('%m', date) = '02'` — month is always zero-padded.

6. **Default month** on page load: current calendar month. Stored in `localStorage` so it persists across page navigations within the same session.

7. **Static files** are served by FastAPI using `StaticFiles` mounted at `/static` and HTML files at the root. Add this to `main.py`:
```python
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app.mount("/static", StaticFiles(directory="frontend/static"), name="static")

@app.get("/")
def dashboard(): return FileResponse("frontend/index.html")

@app.get("/entry")
def entry(): return FileResponse("frontend/entry.html")

@app.get("/log")
def log(): return FileResponse("frontend/log.html")

@app.get("/summary")
def summary(): return FileResponse("frontend/summary.html")
```

---

## What to Build First (Suggested Order)

1. `app/database.py` — schema creation + seed data
2. `app/models.py` — Pydantic models
3. `app/logic.py` — balance and summary calculations
4. `app/main.py` — all API routes
5. `frontend/static/style.css` — full stylesheet
6. `frontend/static/app.js` — shared utilities
7. `frontend/entry.html` + `frontend/static/entry.js` — start here for UI, it's the most-used page
8. `frontend/index.html` + `frontend/static/dashboard.js` — dashboard with charts
9. `frontend/log.html` + `frontend/static/log.js`
10. `frontend/summary.html`

---

## Future Work (Do Not Build Now)

- `scripts/import_excel.py` — import from Rogers Tracker Excel workbook
- Budget planning UI (currently budgets are set via API only)
- Export to CSV
- Multi-year support (currently assumes data exists per year/month pair)
