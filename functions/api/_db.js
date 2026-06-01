function asText(value) {
  return value == null ? "" : String(value).trim();
}

function monthKeyFromDate(date) {
  return asText(date).slice(0, 7);
}

function monthParts(month, year) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    return { year: month.slice(0, 4), month: month.slice(5, 7), key: month };
  }

  const yearText = asText(year);
  const monthText = asText(month).padStart(2, "0");
  return { year: yearText, month: monthText, key: `${yearText}-${monthText}` };
}

function isNumericId(value) {
  return typeof value === "number" || /^\d+$/.test(asText(value));
}

async function lookupName(env, table, id) {
  const row = await env.DB.prepare(`SELECT name FROM ${table} WHERE id = ?`).bind(id).first();
  if (!row) {
    throw new Error(`Unknown ${table.slice(0, -1)}: ${id}`);
  }
  return row.name;
}

async function resolveReference(env, table, value) {
  if (isNumericId(value)) {
    return lookupName(env, table, Number(value));
  }

  const name = asText(value);
  if (!name) {
    throw new Error(`Missing ${table.slice(0, -1)} value`);
  }
  return name;
}

async function listRows(env, table, columns = "id, name") {
  const { results } = await env.DB.prepare(`SELECT ${columns} FROM ${table} ORDER BY id`).all();
  return results;
}

async function getAccounts(env) {
  return listRows(env, "accounts", "id, name, type");
}

async function getCategories(env) {
  return listRows(env, "categories");
}

async function getSources(env) {
  return listRows(env, "income_sources");
}

async function resolveExpenseInput(env, body) {
  return {
    date: asText(body.date),
    amount: Number(body.amount),
    description: body.description == null ? null : asText(body.description) || null,
    category: await resolveReference(env, "categories", body.category ?? body.category_id),
    account: await resolveReference(env, "accounts", body.account ?? body.account_id),
  };
}

async function resolveIncomeInput(env, body) {
  return {
    date: asText(body.date),
    amount: Number(body.amount),
    description: body.description == null ? null : asText(body.description) || null,
    source: await resolveReference(env, "income_sources", body.source ?? body.source_id),
    account: await resolveReference(env, "accounts", body.account ?? body.account_id),
  };
}

async function resolveTransferInput(env, body) {
  return {
    date: asText(body.date),
    amount: Number(body.amount),
    fees: Number(body.fees ?? 0) || 0,
    description: body.description == null ? null : asText(body.description) || null,
    fromAccount: await resolveReference(env, "accounts", body.from_account ?? body.from_account_id),
    toAccount: await resolveReference(env, "accounts", body.to_account ?? body.to_account_id),
  };
}

async function listExpenses(env, filters = {}) {
  if (!filters.month && !filters.year) {
    const { results } = await env.DB.prepare(
      `SELECT e.id, e.date, e.amount, e.description, e.category, e.account, e.month,
              c.id AS category_id, a.id AS account_id
       FROM expenses e
       LEFT JOIN categories c ON c.name = e.category
       LEFT JOIN accounts a ON a.name = e.account
       ORDER BY e.date DESC, e.id DESC
       LIMIT 200`,
    ).all();
    return results;
  }

  const { key } = monthParts(filters.month, filters.year);
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.date, e.amount, e.description, e.category, e.account, e.month,
            c.id AS category_id, a.id AS account_id
     FROM expenses e
     LEFT JOIN categories c ON c.name = e.category
     LEFT JOIN accounts a ON a.name = e.account
     WHERE e.month = ?
     ORDER BY e.date DESC, e.id DESC`,
  ).bind(key).all();
  return results;
}

async function listIncome(env, filters = {}) {
  if (!filters.month && !filters.year) {
    const { results } = await env.DB.prepare(
      `SELECT i.id, i.date, i.amount, i.description, i.source, i.account, i.month,
              s.id AS source_id, a.id AS account_id
       FROM income i
       LEFT JOIN income_sources s ON s.name = i.source
       LEFT JOIN accounts a ON a.name = i.account
       ORDER BY i.date DESC, i.id DESC
       LIMIT 200`,
    ).all();
    return results;
  }

  const { key } = monthParts(filters.month, filters.year);
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.date, i.amount, i.description, i.source, i.account, i.month,
            s.id AS source_id, a.id AS account_id
     FROM income i
     LEFT JOIN income_sources s ON s.name = i.source
     LEFT JOIN accounts a ON a.name = i.account
     WHERE i.month = ?
     ORDER BY i.date DESC, i.id DESC`,
  ).bind(key).all();
  return results;
}

async function listTransfers(env, filters = {}) {
  if (!filters.month && !filters.year) {
    const { results } = await env.DB.prepare(
      `SELECT t.id, t.date, t.amount, t.fees, t.description, t.from_account, t.to_account, t.month,
              fa.id AS from_account_id, ta.id AS to_account_id
       FROM transfers t
       LEFT JOIN accounts fa ON fa.name = t.from_account
       LEFT JOIN accounts ta ON ta.name = t.to_account
       ORDER BY t.date DESC, t.id DESC
       LIMIT 200`,
    ).all();
    return results;
  }

  const { key } = monthParts(filters.month, filters.year);
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.date, t.amount, t.fees, t.description, t.from_account, t.to_account, t.month,
            fa.id AS from_account_id, ta.id AS to_account_id
     FROM transfers t
     LEFT JOIN accounts fa ON fa.name = t.from_account
     LEFT JOIN accounts ta ON ta.name = t.to_account
     WHERE t.month = ?
     ORDER BY t.date DESC, t.id DESC`,
  ).bind(key).all();
  return results;
}

async function getExpenseSummary(env, year, month) {
  const { key } = monthParts(month, year);
  const categories = await getCategories(env);

  const actualRows = await env.DB.prepare(
    "SELECT category, COALESCE(SUM(amount), 0) AS total FROM expenses WHERE month = ? GROUP BY category",
  ).bind(key).all();
  const actualMap = new Map(actualRows.results.map((row) => [row.category, row.total]));

  const feeRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(fees), 0) AS total FROM transfers WHERE month = ?",
  ).bind(key).first();

  return categories.map((row) => {
    const actual = row.name === "Fees" ? (feeRow?.total || 0) : (actualMap.get(row.name) || 0);
    return {
      category_id: row.id,
      category: row.name,
      planned: 0,
      actual,
      diff: 0 - actual,
    };
  });
}

async function getIncomeSummary(env, year, month) {
  const { key } = monthParts(month, year);
  const sources = await getSources(env);

  const actualRows = await env.DB.prepare(
    "SELECT source, COALESCE(SUM(amount), 0) AS total FROM income WHERE month = ? GROUP BY source",
  ).bind(key).all();
  const actualMap = new Map(actualRows.results.map((row) => [row.source, row.total]));

  return sources.map((row) => {
    const actual = actualMap.get(row.name) || 0;
    return {
      source_id: row.id,
      source: row.name,
      planned: 0,
      actual,
      diff: actual,
    };
  });
}

async function getAccountBalance(env, accountName, year, month) {
  const { key } = monthParts(month, year);
  const rollover = 0;

  const incomeRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE account = ? AND month = ?",
  ).bind(accountName, key).first();

  const transfersInRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM transfers WHERE to_account = ? AND month = ?",
  ).bind(accountName, key).first();

  const expensesRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE account = ? AND month = ?",
  ).bind(accountName, key).first();

  const transfersOutRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount + fees), 0) AS total FROM transfers WHERE from_account = ? AND month = ?",
  ).bind(accountName, key).first();

  const earned = (incomeRow?.total || 0) + (transfersInRow?.total || 0);
  const spent = (expensesRow?.total || 0) + (transfersOutRow?.total || 0);
  const current = rollover + earned - spent;

  return { rollover, earned, spent, current };
}

async function getAccountSummary(env, year, month) {
  const accounts = await getAccounts(env);
  const result = [];

  for (const account of accounts) {
    const balance = await getAccountBalance(env, account.name, year, month);
    result.push({
      account_id: account.id,
      account: account.name,
      type: account.type,
      ...balance,
    });
  }

  return result;
}

async function getDashboardData(env, year, month) {
  const expenses = await getExpenseSummary(env, year, month);
  const income = await getIncomeSummary(env, year, month);
  const accounts = await getAccountSummary(env, year, month);

  const totalExpenses = expenses.reduce((sum, row) => sum + row.actual, 0);
  const totalIncome = income.reduce((sum, row) => sum + row.actual, 0);
  const plannedExpenses = expenses.reduce((sum, row) => sum + row.planned, 0);
  const plannedIncome = income.reduce((sum, row) => sum + row.planned, 0);

  return {
    year,
    month,
    expenses,
    income,
    accounts,
    totals: {
      expenses: { planned: plannedExpenses, actual: totalExpenses, diff: plannedExpenses - totalExpenses },
      income: { planned: plannedIncome, actual: totalIncome, diff: totalIncome - plannedIncome },
      liquid_assets: accounts.filter((row) => row.type === "liquid").reduce((sum, row) => sum + row.current, 0),
      financial_assets: accounts.filter((row) => row.type === "financial").reduce((sum, row) => sum + row.current, 0),
      credit: accounts.filter((row) => row.type === "credit").reduce((sum, row) => sum + row.current, 0),
      net: totalIncome - totalExpenses,
    },
  };
}

async function getYearSummary(env, year) {
  const categories = await getCategories(env);
  const sources = await getSources(env);
  const accounts = await getAccounts(env);

  const expenseData = {};
  for (const category of categories) {
    const months = [];
    for (let month = 1; month <= 12; month += 1) {
      const key = monthParts(month, year).key;
      const totalRow = await env.DB.prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE category = ? AND month = ?",
      ).bind(category.name, key).first();
      const feesRow = await env.DB.prepare(
        "SELECT COALESCE(SUM(fees), 0) AS total FROM transfers WHERE month = ?",
      ).bind(key).first();
      months.push(category.name === "Fees" ? (feesRow?.total || 0) : (totalRow?.total || 0));
    }
    expenseData[category.name] = months;
  }

  const incomeData = {};
  for (const source of sources) {
    const months = [];
    for (let month = 1; month <= 12; month += 1) {
      const key = monthParts(month, year).key;
      const totalRow = await env.DB.prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE source = ? AND month = ?",
      ).bind(source.name, key).first();
      months.push(totalRow?.total || 0);
    }
    incomeData[source.name] = months;
  }

  const accountData = {};
  for (const account of accounts) {
    const balances = [];
    for (let month = 1; month <= 12; month += 1) {
      const balance = await getAccountBalance(env, account.name, year, month);
      balances.push(balance.current);
    }
    accountData[account.name] = { balances, type: account.type };
  }

  const monthlyNet = [];
  for (let month = 1; month <= 12; month += 1) {
    const key = monthParts(month, year).key;
    const incomeRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE month = ?",
    ).bind(key).first();
    const expenseRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE month = ?",
    ).bind(key).first();
    const feeRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(fees), 0) AS total FROM transfers WHERE month = ?",
    ).bind(key).first();
    monthlyNet.push((incomeRow?.total || 0) - (expenseRow?.total || 0) - (feeRow?.total || 0));
  }

  return {
    year,
    expenses: expenseData,
    income: incomeData,
    accounts: accountData,
    monthly_net: monthlyNet,
  };
}

async function getCombinedLog(env, year, month, txType = null, accountId = null, categoryId = null, sourceId = null, search = null) {
  const { key } = monthParts(month, year);
  const matches = [];

  if (!txType || txType === "expense") {
    let query = `SELECT e.id, e.date, e.amount, e.description, e.category, e.account, e.month,
                        c.id AS category_id, a.id AS account_id,
                        'expense' AS type, 0 AS fees,
                        NULL AS source, NULL AS source_id,
                        NULL AS from_account, NULL AS to_account,
                        NULL AS from_account_id, NULL AS to_account_id
                 FROM expenses e
                 LEFT JOIN categories c ON c.name = e.category
                 LEFT JOIN accounts a ON a.name = e.account
                 WHERE e.month = ?`;
    const queryParams = [key];
    if (accountId) {
      query += " AND a.id = ?";
      queryParams.push(accountId);
    }
    if (categoryId) {
      query += " AND c.id = ?";
      queryParams.push(categoryId);
    }
    const { results } = await env.DB.prepare(query + " ORDER BY e.date DESC, e.id DESC").bind(...queryParams).all();
    matches.push(...results);
  }

  if (!txType || txType === "income") {
    let query = `SELECT i.id, i.date, i.amount, i.description, i.source, i.account, i.month,
                        NULL AS category, NULL AS category_id,
                        'income' AS type, 0 AS fees,
                        s.id AS source_id,
                        NULL AS from_account, NULL AS to_account,
                        NULL AS from_account_id, NULL AS to_account_id,
                        a.id AS account_id
                 FROM income i
                 LEFT JOIN income_sources s ON s.name = i.source
                 LEFT JOIN accounts a ON a.name = i.account
                 WHERE i.month = ?`;
    const queryParams = [key];
    if (accountId) {
      query += " AND a.id = ?";
      queryParams.push(accountId);
    }
    if (sourceId) {
      query += " AND s.id = ?";
      queryParams.push(sourceId);
    }
    const { results } = await env.DB.prepare(query + " ORDER BY i.date DESC, i.id DESC").bind(...queryParams).all();
    matches.push(...results);
  }

  if (!txType || txType === "transfer") {
    let query = `SELECT t.id, t.date, t.amount, t.fees, t.description, t.from_account, t.to_account, t.month,
                        NULL AS category, NULL AS category_id,
                        'transfer' AS type,
                        NULL AS source, NULL AS source_id,
                        fa.id AS from_account_id, ta.id AS to_account_id,
                        NULL AS account_id
                 FROM transfers t
                 LEFT JOIN accounts fa ON fa.name = t.from_account
                 LEFT JOIN accounts ta ON ta.name = t.to_account
                 WHERE t.month = ?`;
    const queryParams = [key];
    if (accountId) {
      query += " AND (fa.id = ? OR ta.id = ?)";
      queryParams.push(accountId, accountId);
    }
    const { results } = await env.DB.prepare(query + " ORDER BY t.date DESC, t.id DESC").bind(...queryParams).all();
    matches.push(...results);
  }

  let filtered = matches;
  if (search) {
    const needle = asText(search).toLowerCase();
    filtered = filtered.filter((row) => {
      const haystack = [row.description, row.category, row.source, row.account, row.from_account, row.to_account]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  return filtered;
}

export {
  asText,
  monthKeyFromDate,
  monthParts,
  getAccounts,
  getCategories,
  getSources,
  resolveExpenseInput,
  resolveIncomeInput,
  resolveTransferInput,
  listExpenses,
  listIncome,
  listTransfers,
  getDashboardData,
  getYearSummary,
  getCombinedLog,
  getExpenseSummary,
  getIncomeSummary,
  getAccountSummary,
};
