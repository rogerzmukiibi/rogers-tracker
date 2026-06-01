import { getYearSummary } from "../_db.js";

export async function onRequestGet({ env, request }) {
  const year = Number(new URL(request.url).searchParams.get("year"));
  return Response.json(await getYearSummary(env, year));
}
