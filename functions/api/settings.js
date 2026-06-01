import { getAccounts, getCategories, getSources } from "./_db.js";

export async function onRequestGet({ env }) {
  const [accounts, categories, sources] = await Promise.all([
    getAccounts(env),
    getCategories(env),
    getSources(env),
  ]);

  return Response.json({ accounts, categories, sources });
}
