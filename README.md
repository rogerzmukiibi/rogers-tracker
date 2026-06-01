# Rogers Tracker

A personal finance tracker built as a Cloudflare Pages app with Pages Functions and D1.

It is designed as a direct replacement for the Rogers Tracker Excel workbook — same categories, accounts, income sources, and logic — but with a proper UI, charts, and fast mobile data entry.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Cloudflare Pages Functions |
| Database | Cloudflare D1 |
| Frontend | Plain HTML + Vanilla JS + Chart.js |
| Hosting | Cloudflare Pages |
| PWA | Service worker + manifest |

No frontend framework. No build step. The site is served directly by Cloudflare Pages.

---

## Quick Start

### Prerequisites
- A Cloudflare account
- Node.js installed locally for Wrangler

### Install
```bash
git clone <repo>
cd rogers-tracker
npm install
```

### Local dev
```bash
npm run dev
```

This starts Cloudflare Pages locally with a D1 binding.

### Deploy
```bash
npm run deploy
```

Before the first deploy, create the D1 database and apply the schema:

```bash
npx wrangler d1 create rogers-tracker-db
npx wrangler d1 execute rogers-tracker-db --remote --file=./schema.sql
```

Then copy the returned D1 `database_id` into [wrangler.toml](wrangler.toml).

### Custom domain
If your domain is already on Cloudflare, add the Pages custom domain in the Cloudflare dashboard:

1. Open **Cloudflare Dashboard → Pages → rogers-tracker**
2. Open **Custom domains**
3. Add `tracker.mukiibi.me`

Cloudflare creates the DNS record automatically.

---

## Project Structure

```
rogers-tracker/
├── wrangler.toml                ← Cloudflare Pages + D1 config
├── package.json                 ← Wrangler scripts
├── schema.sql                   ← D1 schema + seed data
├── functions/
│   └── api/                     ← Pages Functions API layer
└── frontend/
  ├── index.html               ← redirect to dashboard
  ├── dashboard.html           ← dashboard page
  ├── entry.html               ← transaction entry page
  ├── log.html                 ← transaction log page
  ├── settings.html            ← settings page
  ├── summary.html             ← year summary page
  ├── manifest.json            ← PWA manifest
  ├── sw.js                    ← service worker
  └── static/
    ├── app.js                 ← shared JS helpers
    ├── dashboard.js
    ├── entry.js
    ├── log.js
    ├── settings.js
    ├── summary.js
    └── style.css
```

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

## Notes

- All amounts are stored as integer UGX values.
- The `Fees` category is computed from transfer fees and is not entered directly.
- The `Credit` account is treated as debt and can show negative balances.
- The app is installable as a PWA once deployed on the custom domain.
