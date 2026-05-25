from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import get_db, init_db
from .logic import get_combined_log, get_dashboard, get_year_summary
from .models import (
    AccountCreate,
    AccountUpdate,
    CategoryCreate,
    CategoryUpdate,
    SourceCreate,
    SourceUpdate,
    BudgetExpenseSet,
    BudgetIncomeSet,
    ExpenseCreate,
    ExpenseUpdate,
    IncomeCreate,
    IncomeUpdate,
    RolloverSet,
    TransferCreate,
    TransferUpdate,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
)

app.mount(
    "/static",
    StaticFiles(directory=str(settings.static_dir)),
    name="static",
)


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------

def _page(filename: str) -> FileResponse:
    return FileResponse(str(settings.frontend_dir / filename))


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/dashboard")


@app.get("/dashboard", include_in_schema=False)
def dashboard_page():
    return _page("dashboard.html")


@app.get("/entry", include_in_schema=False)
def entry_page():
    return _page("entry.html")


@app.get("/log", include_in_schema=False)
def log_page():
    return _page("log.html")


@app.get("/summary", include_in_schema=False)
def summary_page():
    return _page("summary.html")


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

@app.get("/api/accounts")
def list_accounts():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, type, sort_order FROM accounts ORDER BY sort_order"
        ).fetchall()
        return [dict(r) for r in rows]


@app.get("/api/categories")
def list_categories():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, sort_order FROM expense_categories ORDER BY sort_order"
        ).fetchall()
        return [dict(r) for r in rows]


@app.get("/api/sources")
def list_sources():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, sort_order FROM income_sources ORDER BY sort_order"
        ).fetchall()
        return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------

@app.post("/api/expenses", status_code=201)
def create_expense(body: ExpenseCreate):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO expenses (date, amount, description, category_id, account_id)"
            " VALUES (?, ?, ?, ?, ?)",
            (body.date, body.amount, body.description, body.category_id, body.account_id),
        )
        return {"id": cur.lastrowid}


@app.get("/api/expenses")
def list_expenses(year: int, month: int):
    y, m = str(year), str(month).zfill(2)
    with get_db() as conn:
        rows = conn.execute(
            """SELECT e.id, e.date, e.amount, e.description,
                      c.name AS category, c.id AS category_id,
                      a.name AS account, a.id AS account_id
               FROM expenses e
               JOIN expense_categories c ON c.id = e.category_id
               JOIN accounts a ON a.id = e.account_id
               WHERE strftime('%Y', e.date) = ? AND strftime('%m', e.date) = ?
               ORDER BY e.date DESC, e.id DESC""",
            (y, m),
        ).fetchall()
        return [dict(r) for r in rows]


@app.put("/api/expenses/{expense_id}")
def update_expense(expense_id: int, body: ExpenseUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        conn.execute(
            f"UPDATE expenses SET {set_clause} WHERE id = ?",
            list(fields.values()) + [expense_id],
        )
    return {"ok": True}


@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Income
# ---------------------------------------------------------------------------

@app.post("/api/income", status_code=201)
def create_income(body: IncomeCreate):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO income (date, amount, description, source_id, account_id)"
            " VALUES (?, ?, ?, ?, ?)",
            (body.date, body.amount, body.description, body.source_id, body.account_id),
        )
        return {"id": cur.lastrowid}


@app.get("/api/income")
def list_income(year: int, month: int):
    y, m = str(year), str(month).zfill(2)
    with get_db() as conn:
        rows = conn.execute(
            """SELECT i.id, i.date, i.amount, i.description,
                      s.name AS source, s.id AS source_id,
                      a.name AS account, a.id AS account_id
               FROM income i
               JOIN income_sources s ON s.id = i.source_id
               JOIN accounts a ON a.id = i.account_id
               WHERE strftime('%Y', i.date) = ? AND strftime('%m', i.date) = ?
               ORDER BY i.date DESC, i.id DESC""",
            (y, m),
        ).fetchall()
        return [dict(r) for r in rows]


@app.put("/api/income/{income_id}")
def update_income(income_id: int, body: IncomeUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        conn.execute(
            f"UPDATE income SET {set_clause} WHERE id = ?",
            list(fields.values()) + [income_id],
        )
    return {"ok": True}


@app.delete("/api/income/{income_id}")
def delete_income(income_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM income WHERE id = ?", (income_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Transfers
# ---------------------------------------------------------------------------

@app.post("/api/transfers", status_code=201)
def create_transfer(body: TransferCreate):
    if body.from_account_id == body.to_account_id:
        raise HTTPException(400, "From and To accounts must be different")
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO transfers (date, amount, fees, description, from_account_id, to_account_id)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (body.date, body.amount, body.fees, body.description,
             body.from_account_id, body.to_account_id),
        )
        return {"id": cur.lastrowid}


@app.get("/api/transfers")
def list_transfers(year: int, month: int):
    y, m = str(year), str(month).zfill(2)
    with get_db() as conn:
        rows = conn.execute(
            """SELECT t.id, t.date, t.amount, t.fees, t.description,
                      fa.name AS from_account, fa.id AS from_account_id,
                      ta.name AS to_account, ta.id AS to_account_id
               FROM transfers t
               JOIN accounts fa ON fa.id = t.from_account_id
               JOIN accounts ta ON ta.id = t.to_account_id
               WHERE strftime('%Y', t.date) = ? AND strftime('%m', t.date) = ?
               ORDER BY t.date DESC, t.id DESC""",
            (y, m),
        ).fetchall()
        return [dict(r) for r in rows]


@app.put("/api/transfers/{transfer_id}")
def update_transfer(transfer_id: int, body: TransferUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        conn.execute(
            f"UPDATE transfers SET {set_clause} WHERE id = ?",
            list(fields.values()) + [transfer_id],
        )
    return {"ok": True}


@app.delete("/api/transfers/{transfer_id}")
def delete_transfer(transfer_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM transfers WHERE id = ?", (transfer_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dashboard, summary, log
# ---------------------------------------------------------------------------

@app.get("/api/dashboard")
def dashboard(year: int, month: int):
    with get_db() as conn:
        return get_dashboard(conn, year, month)


@app.get("/api/summary/year")
def year_summary(year: int):
    with get_db() as conn:
        return get_year_summary(conn, year)


@app.get("/api/log")
def transaction_log(
    year: int,
    month: int,
    type: Optional[str] = None,
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    source_id: Optional[int] = None,
    search: Optional[str] = None,
):
    with get_db() as conn:
        results = get_combined_log(conn, year, month, type, account_id, category_id, source_id)
        if search:
            q = search.lower()
            results = [
                t for t in results
                if q in (t.get("description") or "").lower()
                or q in (t.get("category") or "").lower()
                or q in (t.get("source") or "").lower()
                or q in (t.get("from_account") or "").lower()
                or q in (t.get("to_account") or "").lower()
            ]
        return results


# ---------------------------------------------------------------------------
# Budget & rollovers
# ---------------------------------------------------------------------------

@app.post("/api/budget/expense")
def set_budget_expense(body: BudgetExpenseSet):
    with get_db() as conn:
        conn.execute(
            """INSERT INTO budget_expenses (category_id, year, month, planned) VALUES (?, ?, ?, ?)
               ON CONFLICT(category_id, year, month) DO UPDATE SET planned = excluded.planned""",
            (body.category_id, body.year, body.month, body.planned),
        )
    return {"ok": True}


@app.post("/api/budget/income")
def set_budget_income(body: BudgetIncomeSet):
    with get_db() as conn:
        conn.execute(
            """INSERT INTO budget_income (source_id, year, month, planned) VALUES (?, ?, ?, ?)
               ON CONFLICT(source_id, year, month) DO UPDATE SET planned = excluded.planned""",
            (body.source_id, body.year, body.month, body.planned),
        )
    return {"ok": True}


@app.post("/api/rollover")
def set_rollover(body: RolloverSet):
    with get_db() as conn:
        conn.execute(
            """INSERT INTO account_rollovers (account_id, year, month, amount) VALUES (?, ?, ?, ?)
               ON CONFLICT(account_id, year, month) DO UPDATE SET amount = excluded.amount""",
            (body.account_id, body.year, body.month, body.amount),
        )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Settings page route
# ---------------------------------------------------------------------------

@app.get("/settings", include_in_schema=False)
def settings_page():
    return _page("settings.html")


# ---------------------------------------------------------------------------
# Accounts CRUD
# ---------------------------------------------------------------------------

@app.post("/api/accounts", status_code=201)
def create_account(body: AccountCreate):
    with get_db() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO accounts (name, type, sort_order) VALUES (?, ?, ?)",
                (body.name, body.type, body.sort_order),
            )
        except Exception:
            raise HTTPException(409, f"Account '{body.name}' already exists")
        return {"id": cur.lastrowid}


@app.put("/api/accounts/{account_id}")
def update_account(account_id: int, body: AccountUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        conn.execute(
            f"UPDATE accounts SET {set_clause} WHERE id = ?",
            list(fields.values()) + [account_id],
        )
    return {"ok": True}


@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: int):
    with get_db() as conn:
        # Safety: block deletion if any transactions reference this account
        in_expenses = conn.execute(
            "SELECT COUNT(*) FROM expenses WHERE account_id = ?", (account_id,)
        ).fetchone()[0]
        in_income = conn.execute(
            "SELECT COUNT(*) FROM income WHERE account_id = ?", (account_id,)
        ).fetchone()[0]
        in_transfers = conn.execute(
            "SELECT COUNT(*) FROM transfers WHERE from_account_id = ? OR to_account_id = ?",
            (account_id, account_id),
        ).fetchone()[0]
        in_rollovers = conn.execute(
            "SELECT COUNT(*) FROM account_rollovers WHERE account_id = ?", (account_id,)
        ).fetchone()[0]

        total = in_expenses + in_income + in_transfers + in_rollovers
        if total > 0:
            raise HTTPException(
                409,
                f"Cannot delete: account is referenced by {total} transaction(s) or rollover(s). "
                "Reassign or delete those first.",
            )

        conn.execute("DELETE FROM budget_expenses WHERE category_id = ?", (account_id,))
        conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Expense categories CRUD
# ---------------------------------------------------------------------------

@app.post("/api/categories", status_code=201)
def create_category(body: CategoryCreate):
    with get_db() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO expense_categories (name, sort_order) VALUES (?, ?)",
                (body.name, body.sort_order),
            )
        except Exception:
            raise HTTPException(409, f"Category '{body.name}' already exists")
        return {"id": cur.lastrowid}


@app.put("/api/categories/{category_id}")
def update_category(category_id: int, body: CategoryUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        # Protect the Fees category — its name drives special logic
        row = conn.execute(
            "SELECT name FROM expense_categories WHERE id = ?", (category_id,)
        ).fetchone()
        if row and row["name"] == "Fees" and "name" in fields:
            raise HTTPException(403, "The 'Fees' category name cannot be changed")
        conn.execute(
            f"UPDATE expense_categories SET {set_clause} WHERE id = ?",
            list(fields.values()) + [category_id],
        )
    return {"ok": True}


@app.delete("/api/categories/{category_id}")
def delete_category(category_id: int):
    with get_db() as conn:
        row = conn.execute(
            "SELECT name FROM expense_categories WHERE id = ?", (category_id,)
        ).fetchone()
        if row and row["name"] == "Fees":
            raise HTTPException(403, "The 'Fees' category cannot be deleted")

        in_expenses = conn.execute(
            "SELECT COUNT(*) FROM expenses WHERE category_id = ?", (category_id,)
        ).fetchone()[0]
        if in_expenses > 0:
            raise HTTPException(
                409,
                f"Cannot delete: category has {in_expenses} expense(s). "
                "Reassign or delete those first.",
            )

        conn.execute("DELETE FROM budget_expenses WHERE category_id = ?", (category_id,))
        conn.execute("DELETE FROM expense_categories WHERE id = ?", (category_id,))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Income sources CRUD
# ---------------------------------------------------------------------------

@app.post("/api/sources", status_code=201)
def create_source(body: SourceCreate):
    with get_db() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO income_sources (name, sort_order) VALUES (?, ?)",
                (body.name, body.sort_order),
            )
        except Exception:
            raise HTTPException(409, f"Source '{body.name}' already exists")
        return {"id": cur.lastrowid}


@app.put("/api/sources/{source_id}")
def update_source(source_id: int, body: SourceUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_db() as conn:
        conn.execute(
            f"UPDATE income_sources SET {set_clause} WHERE id = ?",
            list(fields.values()) + [source_id],
        )
    return {"ok": True}


@app.delete("/api/sources/{source_id}")
def delete_source(source_id: int):
    with get_db() as conn:
        in_income = conn.execute(
            "SELECT COUNT(*) FROM income WHERE source_id = ?", (source_id,)
        ).fetchone()[0]
        if in_income > 0:
            raise HTTPException(
                409,
                f"Cannot delete: source has {in_income} income record(s). "
                "Reassign or delete those first.",
            )

        conn.execute("DELETE FROM budget_income WHERE source_id = ?", (source_id,))
        conn.execute("DELETE FROM income_sources WHERE id = ?", (source_id,))
    return {"ok": True}

# ---------------------------------------------------------------------------
# Budget GET (read current planned amounts for a month)
# ---------------------------------------------------------------------------

@app.get("/api/budget")
def get_budget(year: int, month: int):
    with get_db() as conn:
        cats = conn.execute(
            "SELECT id, name FROM expense_categories ORDER BY sort_order"
        ).fetchall()
        srcs = conn.execute(
            "SELECT id, name FROM income_sources ORDER BY sort_order"
        ).fetchall()

        expenses = []
        for c in cats:
            row = conn.execute(
                "SELECT planned FROM budget_expenses WHERE category_id = ? AND year = ? AND month = ?",
                (c["id"], year, month),
            ).fetchone()
            expenses.append({
                "category_id": c["id"],
                "category":    c["name"],
                "planned":     row["planned"] if row else 0,
            })

        income = []
        for s in srcs:
            row = conn.execute(
                "SELECT planned FROM budget_income WHERE source_id = ? AND year = ? AND month = ?",
                (s["id"], year, month),
            ).fetchone()
            income.append({
                "source_id": s["id"],
                "source":    s["name"],
                "planned":   row["planned"] if row else 0,
            })

        return {"expenses": expenses, "income": income}


# ---------------------------------------------------------------------------
# Rollovers GET (read opening balances for a month)
# ---------------------------------------------------------------------------

@app.get("/api/rollovers")
def get_rollovers(year: int, month: int):
    with get_db() as conn:
        accounts = conn.execute(
            "SELECT id, name, type FROM accounts ORDER BY sort_order"
        ).fetchall()
        result = []
        for a in accounts:
            row = conn.execute(
                "SELECT amount FROM account_rollovers WHERE account_id = ? AND year = ? AND month = ?",
                (a["id"], year, month),
            ).fetchone()
            result.append({
                "account_id": a["id"],
                "account":    a["name"],
                "type":       a["type"],
                "amount":     row["amount"] if row else 0,
            })
        return result


# ---------------------------------------------------------------------------
# Rollover carry-forward (copy previous month closing → this month opening)
# ---------------------------------------------------------------------------

@app.post("/api/rollover/carry-forward")
def carry_forward_rollovers(year: int, month: int):
    """
    Compute every account's closing balance for (prev_year, prev_month)
    and upsert those values as rollovers for (year, month).
    """
    from .logic import get_account_balance

    if month == 1:
        prev_year, prev_month = year - 1, 12
    else:
        prev_year, prev_month = year, month - 1

    with get_db() as conn:
        accounts = conn.execute(
            "SELECT id FROM accounts"
        ).fetchall()
        carried = 0
        for a in accounts:
            bal = get_account_balance(conn, a["id"], prev_year, prev_month)
            closing = bal["current"]
            conn.execute(
                """INSERT INTO account_rollovers (account_id, year, month, amount) VALUES (?, ?, ?, ?)
                   ON CONFLICT(account_id, year, month) DO UPDATE SET amount = excluded.amount""",
                (a["id"], year, month, closing),
            )
            carried += 1

    return {
        "ok":      True,
        "carried": carried,
        "from":    {"year": prev_year, "month": prev_month},
        "to":      {"year": year,      "month": month},
    }