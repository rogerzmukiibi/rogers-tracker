import sqlite3
from typing import Any

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ym(year: int, month: int) -> tuple[str, str]:
    """Return (year_str, zero_padded_month_str) for SQLite strftime filtering."""
    return str(year), str(month).zfill(2)


# ---------------------------------------------------------------------------
# Account balance components
# ---------------------------------------------------------------------------

def get_rollover(conn: sqlite3.Connection, account_id: int, year: int, month: int) -> int:
    row = conn.execute(
        "SELECT amount FROM account_rollovers WHERE account_id = ? AND year = ? AND month = ?",
        (account_id, year, month),
    ).fetchone()
    return row["amount"] if row else 0


def get_earned(conn: sqlite3.Connection, account_id: int, year: int, month: int) -> int:
    """Income credited to this account + transfers INTO this account."""
    y, m = _ym(year, month)

    income = conn.execute(
        """SELECT COALESCE(SUM(amount), 0) AS t FROM income
           WHERE account_id = ?
             AND strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
        (account_id, y, m),
    ).fetchone()["t"]

    transfers_in = conn.execute(
        """SELECT COALESCE(SUM(amount), 0) AS t FROM transfers
           WHERE to_account_id = ?
             AND strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
        (account_id, y, m),
    ).fetchone()["t"]

    return income + transfers_in


def get_spent(conn: sqlite3.Connection, account_id: int, year: int, month: int) -> int:
    """Expenses from this account + transfers OUT + fees on outgoing transfers."""
    y, m = _ym(year, month)

    expenses = conn.execute(
        """SELECT COALESCE(SUM(amount), 0) AS t FROM expenses
           WHERE account_id = ?
             AND strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
        (account_id, y, m),
    ).fetchone()["t"]

    transfers_out = conn.execute(
        """SELECT COALESCE(SUM(amount), 0) AS t FROM transfers
           WHERE from_account_id = ?
             AND strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
        (account_id, y, m),
    ).fetchone()["t"]

    fees = conn.execute(
        """SELECT COALESCE(SUM(fees), 0) AS t FROM transfers
           WHERE from_account_id = ?
             AND strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
        (account_id, y, m),
    ).fetchone()["t"]

    return expenses + transfers_out + fees


def get_account_balance(
    conn: sqlite3.Connection, account_id: int, year: int, month: int
) -> dict[str, int]:
    rollover = get_rollover(conn, account_id, year, month)
    earned   = get_earned(conn, account_id, year, month)
    spent    = get_spent(conn, account_id, year, month)
    return {
        "rollover": rollover,
        "earned":   earned,
        "spent":    spent,
        "current":  rollover + earned - spent,
    }


def get_total_fees(conn: sqlite3.Connection, year: int, month: int) -> int:
    y, m = _ym(year, month)
    return conn.execute(
        """SELECT COALESCE(SUM(fees), 0) AS t FROM transfers
           WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
        (y, m),
    ).fetchone()["t"]


# ---------------------------------------------------------------------------
# Monthly summaries
# ---------------------------------------------------------------------------

def get_expense_summary(
    conn: sqlite3.Connection, year: int, month: int
) -> list[dict[str, Any]]:
    y, m = _ym(year, month)
    categories = conn.execute(
        "SELECT id, name FROM expense_categories ORDER BY sort_order"
    ).fetchall()

    result = []
    for cat in categories:
        cat_id, cat_name = cat["id"], cat["name"]

        # Fees row is always computed from the transfers table
        if cat_name == "Fees":
            actual = get_total_fees(conn, year, month)
        else:
            actual = conn.execute(
                """SELECT COALESCE(SUM(amount), 0) AS t FROM expenses
                   WHERE category_id = ?
                     AND strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
                (cat_id, y, m),
            ).fetchone()["t"]

        planned_row = conn.execute(
            "SELECT planned FROM budget_expenses WHERE category_id = ? AND year = ? AND month = ?",
            (cat_id, year, month),
        ).fetchone()
        planned = planned_row["planned"] if planned_row else 0

        result.append({
            "category_id": cat_id,
            "category":    cat_name,
            "planned":     planned,
            "actual":      actual,
            "diff":        planned - actual,
        })
    return result


def get_income_summary(
    conn: sqlite3.Connection, year: int, month: int
) -> list[dict[str, Any]]:
    y, m = _ym(year, month)
    sources = conn.execute(
        "SELECT id, name FROM income_sources ORDER BY sort_order"
    ).fetchall()

    result = []
    for src in sources:
        src_id, src_name = src["id"], src["name"]

        actual = conn.execute(
            """SELECT COALESCE(SUM(amount), 0) AS t FROM income
               WHERE source_id = ?
                 AND strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
            (src_id, y, m),
        ).fetchone()["t"]

        planned_row = conn.execute(
            "SELECT planned FROM budget_income WHERE source_id = ? AND year = ? AND month = ?",
            (src_id, year, month),
        ).fetchone()
        planned = planned_row["planned"] if planned_row else 0

        result.append({
            "source_id": src_id,
            "source":    src_name,
            "planned":   planned,
            "actual":    actual,
            "diff":      actual - planned,
        })
    return result


def get_accounts_summary(
    conn: sqlite3.Connection, year: int, month: int
) -> list[dict[str, Any]]:
    accounts = conn.execute(
        "SELECT id, name, type FROM accounts ORDER BY sort_order"
    ).fetchall()
    result = []
    for acc in accounts:
        bal = get_account_balance(conn, acc["id"], year, month)
        result.append({
            "account_id": acc["id"],
            "account":    acc["name"],
            "type":       acc["type"],
            **bal,
        })
    return result


# ---------------------------------------------------------------------------
# Dashboard aggregate
# ---------------------------------------------------------------------------

def get_dashboard(
    conn: sqlite3.Connection, year: int, month: int
) -> dict[str, Any]:
    expenses = get_expense_summary(conn, year, month)
    income   = get_income_summary(conn, year, month)
    accounts = get_accounts_summary(conn, year, month)

    total_expenses        = sum(e["actual"]  for e in expenses)
    total_income          = sum(i["actual"]  for i in income)
    total_planned_expenses = sum(e["planned"] for e in expenses)
    total_planned_income  = sum(i["planned"] for i in income)

    liquid_current    = sum(a["current"] for a in accounts if a["type"] == "liquid")
    financial_current = sum(a["current"] for a in accounts if a["type"] == "financial")
    credit_current    = sum(a["current"] for a in accounts if a["type"] == "credit")

    return {
        "year":     year,
        "month":    month,
        "expenses": expenses,
        "income":   income,
        "accounts": accounts,
        "totals": {
            "expenses": {
                "planned": total_planned_expenses,
                "actual":  total_expenses,
                "diff":    total_planned_expenses - total_expenses,
            },
            "income": {
                "planned": total_planned_income,
                "actual":  total_income,
                "diff":    total_income - total_planned_income,
            },
            "liquid_assets":    liquid_current,
            "financial_assets": financial_current,
            "credit":           credit_current,
            "net":              total_income - total_expenses,
        },
    }


# ---------------------------------------------------------------------------
# Year summary
# ---------------------------------------------------------------------------

def get_year_summary(conn: sqlite3.Connection, year: int) -> dict[str, Any]:
    categories = conn.execute(
        "SELECT id, name FROM expense_categories ORDER BY sort_order"
    ).fetchall()
    sources = conn.execute(
        "SELECT id, name FROM income_sources ORDER BY sort_order"
    ).fetchall()
    accounts = conn.execute(
        "SELECT id, name, type FROM accounts ORDER BY sort_order"
    ).fetchall()

    expense_data: dict[str, list[int]] = {}
    for cat in categories:
        monthly = []
        for month in range(1, 13):
            y, m = _ym(year, month)
            if cat["name"] == "Fees":
                val = get_total_fees(conn, year, month)
            else:
                val = conn.execute(
                    """SELECT COALESCE(SUM(amount), 0) AS t FROM expenses
                       WHERE category_id = ?
                         AND strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
                    (cat["id"], y, m),
                ).fetchone()["t"]
            monthly.append(val)
        expense_data[cat["name"]] = monthly

    income_data: dict[str, list[int]] = {}
    for src in sources:
        monthly = []
        for month in range(1, 13):
            y, m = _ym(year, month)
            val = conn.execute(
                """SELECT COALESCE(SUM(amount), 0) AS t FROM income
                   WHERE source_id = ?
                     AND strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
                (src["id"], y, m),
            ).fetchone()["t"]
            monthly.append(val)
        income_data[src["name"]] = monthly

    account_data: dict[str, Any] = {}
    for acc in accounts:
        balances = []
        for month in range(1, 13):
            bal = get_account_balance(conn, acc["id"], year, month)
            balances.append(bal["current"])
        account_data[acc["name"]] = {"balances": balances, "type": acc["type"]}

    monthly_net = []
    for month in range(1, 13):
        y, m = _ym(year, month)
        inc = conn.execute(
            """SELECT COALESCE(SUM(amount), 0) AS t FROM income
               WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
            (y, m),
        ).fetchone()["t"]
        exp = conn.execute(
            """SELECT COALESCE(SUM(amount), 0) AS t FROM expenses
               WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?""",
            (y, m),
        ).fetchone()["t"]
        fees = get_total_fees(conn, year, month)
        monthly_net.append(inc - exp - fees)

    return {
        "year":        year,
        "expenses":    expense_data,
        "income":      income_data,
        "accounts":    account_data,
        "monthly_net": monthly_net,
    }


# ---------------------------------------------------------------------------
# Combined transaction log
# ---------------------------------------------------------------------------

def get_combined_log(
    conn: sqlite3.Connection,
    year: int,
    month: int,
    tx_type: str | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    source_id: int | None = None,
) -> list[dict[str, Any]]:
    y, m = _ym(year, month)
    result = []

    if not tx_type or tx_type == "expense":
        q = """
            SELECT e.id, e.date, e.amount, e.description,
                   c.name AS category, c.id AS category_id,
                   a.name AS account, a.id AS account_id,
                   'expense' AS type,
                   0 AS fees, NULL AS source,
                   NULL AS from_account, NULL AS to_account,
                   NULL AS from_account_id, NULL AS to_account_id,
                   NULL AS source_id
            FROM expenses e
            JOIN expense_categories c ON c.id = e.category_id
            JOIN accounts a ON a.id = e.account_id
            WHERE strftime('%Y', e.date) = ? AND strftime('%m', e.date) = ?
        """
        params: list[Any] = [y, m]
        if account_id:
            q += " AND e.account_id = ?"
            params.append(account_id)
        if category_id:
            q += " AND e.category_id = ?"
            params.append(category_id)
        result.extend(dict(r) for r in conn.execute(q, params).fetchall())

    if not tx_type or tx_type == "income":
        q = """
            SELECT i.id, i.date, i.amount, i.description,
                   NULL AS category, NULL AS category_id,
                   a.name AS account, a.id AS account_id,
                   'income' AS type,
                   0 AS fees, s.name AS source,
                   NULL AS from_account, NULL AS to_account,
                   NULL AS from_account_id, NULL AS to_account_id,
                   s.id AS source_id
            FROM income i
            JOIN income_sources s ON s.id = i.source_id
            JOIN accounts a ON a.id = i.account_id
            WHERE strftime('%Y', i.date) = ? AND strftime('%m', i.date) = ?
        """
        params = [y, m]
        if account_id:
            q += " AND i.account_id = ?"
            params.append(account_id)
        if source_id:
            q += " AND i.source_id = ?"
            params.append(source_id)
        result.extend(dict(r) for r in conn.execute(q, params).fetchall())

    if not tx_type or tx_type == "transfer":
        q = """
            SELECT t.id, t.date, t.amount, t.description,
                   NULL AS category, NULL AS category_id,
                   NULL AS account, NULL AS account_id,
                   'transfer' AS type,
                   t.fees, NULL AS source,
                   fa.name AS from_account, ta.name AS to_account,
                   fa.id AS from_account_id, ta.id AS to_account_id,
                   NULL AS source_id
            FROM transfers t
            JOIN accounts fa ON fa.id = t.from_account_id
            JOIN accounts ta ON ta.id = t.to_account_id
            WHERE strftime('%Y', t.date) = ? AND strftime('%m', t.date) = ?
        """
        params = [y, m]
        if account_id:
            q += " AND (t.from_account_id = ? OR t.to_account_id = ?)"
            params.extend([account_id, account_id])
        result.extend(dict(r) for r in conn.execute(q, params).fetchall())

    result.sort(key=lambda x: (x["date"], x["id"]), reverse=True)
    return result
