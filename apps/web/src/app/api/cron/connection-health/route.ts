import { serverEnv } from "@/lib/server/serverEnv";
import { checkAllHealth } from "@/lib/server/connectionHealth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Hourly Vercel cron (see vercel.json). Tests every MCP connection and NANGO
// credential of every team. Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = serverEnv.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const teams = await checkAllHealth();
  const items = teams.flatMap((t) => [...t.mcp, ...t.nango]);
  const failed = items.filter((i) => i.status === "error");
  for (const f of failed) console.warn(`[connection-health] ${f.name} (${f.id}): ${f.error}`);

  return Response.json({
    teams: teams.length,
    checked: items.filter((i) => i.status !== "skipped").length,
    failed: failed.map((f) => ({ id: f.id, name: f.name, error: f.error })),
  });
}
