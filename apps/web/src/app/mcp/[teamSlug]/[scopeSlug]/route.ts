import { NextResponse } from "next/server";
import { getTeamBySlug } from "@/lib/server/team";
import { serveTeamMcp } from "@/lib/server/mcpMount";

// Per-scope MCP mount. Publicly reached at /[teamSlug]/[scopeSlug] — middleware
// rewrites MCP requests there to /mcp/[teamSlug]/[scopeSlug]. Serves only the
// toolsets published in that scope; the caller's bearer must grant access to the
// team (enforced in serveTeamMcp).
async function handle(req: Request, ctx: { params: Promise<{ teamSlug: string; scopeSlug: string }> }) {
  const { teamSlug, scopeSlug } = await ctx.params;
  const team = await getTeamBySlug(teamSlug);
  if (!team) return NextResponse.json({ error: "not found" }, { status: 404 });
  return serveTeamMcp(req, team.id, scopeSlug);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
