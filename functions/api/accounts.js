import { getAccounts, monthParts } from "./_db.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const year = url.searchParams.get("year");

  if (!month && !year) {
    return Response.json(await getAccounts(env));
  }

  const { key } = monthParts(month, year);
  const accounts = await getAccounts(env);
  const balances = [];

  for (const account of accounts) {
    const incomeRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE account = ? AND month = ?",
    ).bind(account.name, key).first();
    const transfersInRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM transfers WHERE to_account = ? AND month = ?",
    ).bind(account.name, key).first();
    const expensesRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE account = ? AND month = ?",
    ).bind(account.name, key).first();
    const transfersOutRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount + fees), 0) AS total FROM transfers WHERE from_account = ? AND month = ?",
    ).bind(account.name, key).first();

    const earned = (incomeRow?.total || 0) + (transfersInRow?.total || 0);
    const spent = (expensesRow?.total || 0) + (transfersOutRow?.total || 0);

    balances.push({
      ...account,
      rollover: 0,
      earned,
      spent,
      current: earned - spent,
    });
  }

  return Response.json(balances);
}

export async function onRequestPut({ env, params, request }) {
  const body = await request.json();
  const name = String(body.name || "").trim();
  const type = String(body.type || "").trim();

  if (!name) {
    return Response.json({ error: "Account name is required" }, { status: 400 });
  }

  if (!["liquid", "financial", "credit"].includes(type)) {
    return Response.json({ error: "Invalid account type" }, { status: 400 });
  }

  const exists = await env.DB.prepare(
    "SELECT id FROM accounts WHERE name = ? AND id != ?"
  ).bind(name, params.id).first();

  if (exists) {
    return Response.json({ error: `Account '${name}' already exists` }, { status: 409 });
  }

  await env.DB.prepare(
    "UPDATE accounts SET name = ?, type = ? WHERE id = ?"
  ).bind(name, type, params.id).run();

  return Response.json({ success: true });
}

