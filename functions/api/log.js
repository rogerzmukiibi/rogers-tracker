import { getCombinedLog } from "./_db.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  const type = url.searchParams.get("type");
  const accountId = url.searchParams.get("account_id") || url.searchParams.get("account");
  const categoryId = url.searchParams.get("category_id") || url.searchParams.get("category");
  const sourceId = url.searchParams.get("source_id") || url.searchParams.get("source");
  const search = url.searchParams.get("search");

  return Response.json(
    await getCombinedLog(
      env,
      year,
      month,
      type || null,
      accountId ? Number(accountId) : null,
      categoryId ? Number(categoryId) : null,
      sourceId ? Number(sourceId) : null,
      search,
    ),
  );
}
