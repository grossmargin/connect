import { NextResponse } from "next/server";
import { getTeamBySlug } from "@/lib/server/team";
import { serveTeamMcp } from "@/lib/server/mcpMount";

// Per-team MCP mount at /<teamSlug>/mcp. Middleware also rewrites MCP requests
// on the bare /<teamSlug> here (that path also serves the UI). The caller's
// bearer must grant access to this team, which serveTeamMcp enforces.
async function handle(req: Request, ctx: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await ctx.params;
  const team = await getTeamBySlug(teamSlug);
  if (!team) return NextResponse.json({ error: "not found" }, { status: 404 });
  return serveTeamMcp(req, team.id);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
