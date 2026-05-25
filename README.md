# Rogers Tracker

A personal finance tracker built as a self-hosted web app. Runs in Docker, accessible in any browser on PC and phone, data synced across devices via Syncthing.

Designed as a direct replacement for the Rogers Tracker Excel workbook — same categories, accounts, income sources, and logic — but with a proper UI, charts, and fast mobile data entry.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 + FastAPI |
| Database | SQLite (single file: `data/tracker.db`) |
| Frontend | Plain HTML + Vanilla JS + Chart.js |
| Container | Docker + Docker Compose |
| Sync | Syncthing (syncs the `data/` folder) |

No build step. No Node. No compiled frontend. The frontend is static files served directly by FastAPI.

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Run
```bash
git clone <repo>
cd rogers-tracker
docker compose up
```

Open `http://localhost:8000` in your browser.

### Access from phone (same Wi-Fi)
Find your PC's local IP address (e.g. `192.168.1.x`) and open `http://192.168.1.x:8000` on your phone browser.

---

## Project Structure

```
rogers-tracker/
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── data/                        ← SQLite DB lives here (synced by Syncthing)
│   └── tracker.db               ← auto-created on first run
├── app/
│   ├── __init__.py
│   ├── config.py
│   ├── database.py              ← SQLite connection, schema creation, seed data
│   ├── logic.py                 ← Business logic (balance calc, summaries)
│   ├── main.py                  ← FastAPI app, all routes
│   └── models.py                ← Pydantic request/response models
└── frontend/
  ├── index.html               ← Dashboard (charts, monthly overview)
  ├── dashboard.html           ← Alternate dashboard page
  ├── entry.html               ← Transaction entry (expense / income / transfer)
  ├── log.html                 ← Transaction log with filters
  ├── settings.html            ← App settings page
  ├── summary.html             ← Year-to-date summary table
  └── static/
    ├── app.js               ← Shared JS (API calls, navigation, formatting)
    ├── dashboard.js         ← Dashboard-specific chart logic
    ├── entry.js             ← Entry form logic
    ├── log.js               ← Log filter/render logic
    ├── settings.js         ← Settings page logic
    ├── summary.js          ← Summary page logic
    └── style.css            ← All styles
```

---

## Syncthing Setup

Syncthing syncs the `data/` folder (which contains `tracker.db`) across devices.

1. Install [Syncthing](https://syncthing.net/) on PC and phone
2. Add the `rogers-tracker/data/` folder as a shared folder in Syncthing
3. Pair your devices
4. Syncthing will keep `tracker.db` in sync automatically

> The Docker container runs on your PC only. Your phone connects to it as a browser client over your local network. Syncthing ensures the database is available if you ever run the app on a different machine.

---

## Data Model Overview

### Accounts
All pools that hold money. Each account tracks: rollover (start of month), earned (income + transfers in), spent (expenses + transfers out + fees), current balance.

Accounts: `Cash`, `MTN`, `Airtel`, `Coins`, `Sanlam`, `Mokash`, `UAP RM`, `Xeno`, `Centenary`, `Equity`, `Credit`

Account types:
- `liquid` — Cash, MTN, Airtel, Coins, Mokash (everyday spending accounts)
- `financial` — Sanlam, UAP RM, Xeno, Centenary, Equity (savings/investments)
- `credit` — Credit (special handling, see below)

### Expense Categories
`Fees`, `Rent`, `Transportation`, `Food`, `Clothes`, `Personal`, `Household`, `Health/medical`, `Faith`, `Gifts`, `Phone Bills`, `Utilities`, `Rotaract`, `Gig costs`, `Untracked`, `Farming`

> `Fees` is auto-computed from the transfer table — never entered directly.

### Income Sources
`Salo`, `Hustle`, `Family`, `Interest`, `Other`, `Gig`

### Transactions
Three transaction types:

**Expense** — money leaving an account for a category
- Fields: date, amount, description, category, account

**Income** — money entering an account from a source
- Fields: date, amount, description, source, account

**Transfer** — money moving between accounts (may include a fee)
- Fields: date, amount, fees, description, from_account, to_account
- The `fees` field represents money lost to the service provider (carrier charges, withdraw fees)

### Credit Account (Special Logic)
Credit represents loan money. It behaves as an account, not a direct income/expense source.
- Receiving a loan: Transfer from `Credit` → `Cash` (or other account). Money appears in the destination account.
- Repaying a loan: Transfer from `Cash` (or other account) → `Credit`.
- Credit balance is typically negative (money owed).
- Credit is also listed under both Expenses and Income on the dashboard to reflect net cash flow impact.

---

## Account Balance Formula

```
current_balance = rollover + earned - spent

where:
  earned = sum(income transactions for this account this month)
           + sum(transfer amounts INTO this account this month)

  spent  = sum(expense transactions from this account this month)
           + sum(transfer amounts OUT of this account this month)
           + sum(transfer fees where this account is the from_account)
```

---

## Monthly Flow Summary

```
net = total_income - total_expenses

where:
  total_income   = sum of all income transactions for the month
  total_expenses = sum of all expense transactions + all transfer fees
```

---

## Development

To run without Docker (for development):
```bash
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

The app auto-creates `data/tracker.db` and seeds it with accounts, categories, and income sources on first run.

---

## Importing from Excel

A future import script (`scripts/import_excel.py`) will parse the Rogers Tracker Excel workbook and load historical transactions into the database. Not yet implemented.
