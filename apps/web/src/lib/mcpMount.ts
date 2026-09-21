import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildMcpHandler } from "@/lib/mcpServer";
import { renderRootInstructions } from "@/lib/mcpInstructions";
import { resolveScope } from "@/lib/scopes";

// Serve the MCP server for one team's published scope. With no `scopeSlug` this
// is the team's default scope (served at / and /[teamSlug]); with a slug it is
// the named scope published at /[teamSlug]/[slug]. Only the scope's toolsets are
// exposed. The handler endpoint matches the incoming path (so it works behind a
// middleware rewrite) and the principal is narrowed to `teamId`.
export async function serveTeamMcp(req: Request, teamId: string, scopeSlug?: string) {
  const scope = await resolveScope(teamId, scopeSlug);
  if (!scope) {
    return NextResponse.json({ error: "unknown scope" }, { status: 404 });
  }

  const toolsets = [...scope.toolsets].sort((a, b) => a.name.localeCompare(b.name));
  const vaults = await prisma.vault.findMany({
    where: { teamId },
    orderBy: { name: "asc" },
    select: { name: true, description: true },
  });

  const instructions = renderRootInstructions(
    toolsets.map((t) => ({
      name: t.name,
      slug: t.slug,
      tenants: t.connections.map((c) => ({ id: c.slug, name: c.name })),
    })),
    vaults,
    [],
  );

  const endpoint = new URL(req.url).pathname;
  return buildMcpHandler(toolsets, [], instructions, { endpoint, teamScope: teamId })(req);
}

// A handler that requires a bearer but serves nothing — used when we cannot pick
// a team (no/invalid bearer). withMcpAuth returns 401 for a missing/bad token.
export function serveUnauthenticatedMcp(req: Request) {
  const endpoint = new URL(req.url).pathname;
  return buildMcpHandler([], [], undefined, { endpoint })(req);
}
