import { NextResponse } from "next/server";
import { getTeamBySlug } from "@/lib/server/team";
import { serveTeamMcp } from "@/lib/server/mcpMount";

// Per-scope MCP mount at /<teamSlug>/mcp/<scopeSlug>. Middleware also rewrites
// MCP requests on /<teamSlug>/<scopeSlug> here. Serves only the members
// published in that scope; the caller's bearer must grant access to the team
// (enforced in serveTeamMcp).
async function handle(req: Request, ctx: { params: Promise<{ teamSlug: string; scopeSlug: string }> }) {
  const { teamSlug, scopeSlug } = await ctx.params;
  const team = await getTeamBySlug(teamSlug);
  if (!team) return NextResponse.json({ error: "not found" }, { status: 404 });
  return serveTeamMcp(req, team.id, scopeSlug);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
