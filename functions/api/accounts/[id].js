import { getAccounts } from "../_db.js";

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
