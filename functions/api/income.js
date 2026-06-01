import { listIncome, monthKeyFromDate, resolveIncomeInput } from "./_db.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const year = url.searchParams.get("year");
  return Response.json(await listIncome(env, { month, year }));
}

export async function onRequestPost({ env, request }) {
  const body = await request.json();
  const input = await resolveIncomeInput(env, body);
  const month = monthKeyFromDate(input.date);

  const result = await env.DB.prepare(
    `INSERT INTO income (date, amount, description, source, account, month)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(input.date, input.amount, input.description, input.source, input.account, month).run();

  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
