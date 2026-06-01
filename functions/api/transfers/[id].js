import { monthKeyFromDate, resolveTransferInput } from "../_db.js";

export async function onRequestGet({ env, params }) {
  const row = await env.DB.prepare("SELECT * FROM transfers WHERE id = ?").bind(params.id).first();
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(row);
}

export async function onRequestPut({ env, params, request }) {
  const body = await request.json();
  const input = await resolveTransferInput(env, body);

  if (input.fromAccount === input.toAccount) {
    return Response.json({ error: "From and To accounts must be different" }, { status: 400 });
  }

  const month = monthKeyFromDate(input.date);
  await env.DB.prepare(
    `UPDATE transfers
     SET date = ?, amount = ?, fees = ?, description = ?, from_account = ?, to_account = ?, month = ?
     WHERE id = ?`
  ).bind(input.date, input.amount, input.fees, input.description, input.fromAccount, input.toAccount, month, params.id).run();

  return Response.json({ success: true });
}

export async function onRequestDelete({ env, params }) {
  await env.DB.prepare("DELETE FROM transfers WHERE id = ?").bind(params.id).run();
  return Response.json({ success: true });
}
