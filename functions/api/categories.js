import { getCategories } from "./_db.js";

export async function onRequestGet({ env }) {
  return Response.json(await getCategories(env));
}

export async function onRequestPut({ env, params, request }) {
  const body = await request.json();
  const name = String(body.name || "").trim();

  if (!name) {
    return Response.json({ error: "Category name is required" }, { status: 400 });
  }

  const exists = await env.DB.prepare(
    "SELECT id FROM categories WHERE name = ? AND id != ?"
  ).bind(name, params.id).first();

  if (exists) {
    return Response.json({ error: `Category '${name}' already exists` }, { status: 409 });
  }

  await env.DB.prepare(
    "UPDATE categories SET name = ? WHERE id = ?"
  ).bind(name, params.id).run();

  return Response.json({ success: true });
}

