export async function onRequestPut({ env, params, request }) {
  const body = await request.json();
  const name = String(body.name || "").trim();

  if (!name) {
    return Response.json({ error: "Source name is required" }, { status: 400 });
  }

  const exists = await env.DB.prepare(
    "SELECT id FROM income_sources WHERE name = ? AND id != ?"
  ).bind(name, params.id).first();

  if (exists) {
    return Response.json({ error: `Source '${name}' already exists` }, { status: 409 });
  }

  await env.DB.prepare(
    "UPDATE income_sources SET name = ? WHERE id = ?"
  ).bind(name, params.id).run();

  return Response.json({ success: true });
}
