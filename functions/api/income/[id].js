import { monthKeyFromDate, resolveIncomeInput } from "../_db.js";

export async function onRequestGet({ env, params }) {
  const row = await env.DB.prepare("SELECT * FROM income WHERE id = ?").bind(params.id).first();
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(row);
}

export async function onRequestPut({ env, params, request }) {
  const body = await request.json();
  const input = await resolveIncomeInput(env, body);
  const month = monthKeyFromDate(input.date);

  await env.DB.prepare(
    `UPDATE income
     SET date = ?, amount = ?, description = ?, source = ?, account = ?, month = ?
     WHERE id = ?`
  ).bind(input.date, input.amount, input.description, input.source, input.account, month, params.id).run();

  return Response.json({ success: true });
}

export async function onRequestDelete({ env, params }) {
  await env.DB.prepare("DELETE FROM income WHERE id = ?").bind(params.id).run();
  return Response.json({ success: true });
}
