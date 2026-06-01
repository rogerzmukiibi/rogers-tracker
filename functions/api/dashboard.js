import { getDashboardData } from "./_db.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  return Response.json(await getDashboardData(env, year, month));
}
