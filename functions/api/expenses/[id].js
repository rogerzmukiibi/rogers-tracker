import { monthKeyFromDate, resolveExpenseInput } from "../_db.js";

export async function onRequestGet({ env, params }) {
  const row = await env.DB.prepare("SELECT * FROM expenses WHERE id = ?").bind(params.id).first();
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(row);
}

export async function onRequestPut({ env, params, request }) {
  const body = await request.json();
  const input = await resolveExpenseInput(env, body);
  const month = monthKeyFromDate(input.date);

  await env.DB.prepare(
    `UPDATE expenses
     SET date = ?, amount = ?, description = ?, category = ?, account = ?, month = ?
     WHERE id = ?`
  ).bind(input.date, input.amount, input.description, input.category, input.account, month, params.id).run();

  return Response.json({ success: true });
}

export async function onRequestDelete({ env, params }) {
  await env.DB.prepare("DELETE FROM expenses WHERE id = ?").bind(params.id).run();
  return Response.json({ success: true });
}
