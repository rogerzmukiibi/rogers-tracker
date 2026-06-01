import { getExpenseSummary, getIncomeSummary, monthParts } from "./_db.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const year = url.searchParams.get("year");

  if (!month && !year) {
    return Response.json({ error: "month required" }, { status: 400 });
  }

  const { key } = monthParts(month, year);
  const incomeRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE month = ?",
  ).bind(key).first();
  const expensesRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE month = ?",
  ).bind(key).first();
  const feesRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(fees), 0) AS total FROM transfers WHERE month = ?",
  ).bind(key).first();

  const byCategory = await getExpenseSummary(env, year || key.slice(0, 4), key.slice(5, 7));
  const bySource = await getIncomeSummary(env, year || key.slice(0, 4), key.slice(5, 7));

  const totalIncome = incomeRow?.total || 0;
  const totalExpenses = (expensesRow?.total || 0) + (feesRow?.total || 0);

  return Response.json({
    month: key,
    totalIncome,
    totalExpenses,
    totalFees: feesRow?.total || 0,
    net: totalIncome - totalExpenses,
    byCategory,
    bySource,
  });
}
