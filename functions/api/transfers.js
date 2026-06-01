import { listTransfers, monthKeyFromDate, resolveTransferInput } from "./_db.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const year = url.searchParams.get("year");
  return Response.json(await listTransfers(env, { month, year }));
}

export async function onRequestPost({ env, request }) {
  const body = await request.json();
  const input = await resolveTransferInput(env, body);

  if (input.fromAccount === input.toAccount) {
    return Response.json({ error: "From and To accounts must be different" }, { status: 400 });
  }

  const month = monthKeyFromDate(input.date);
  const result = await env.DB.prepare(
    `INSERT INTO transfers (date, amount, fees, description, from_account, to_account, month)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(input.date, input.amount, input.fees, input.description, input.fromAccount, input.toAccount, month).run();

  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
