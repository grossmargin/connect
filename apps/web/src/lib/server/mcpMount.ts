import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { buildMcpHandler } from "@/lib/server/mcpServer";
import { renderRootInstructions } from "@/lib/isomorphic/mcpInstructions";
import { exposesCredentials, resolveScope } from "@/lib/server/scopes";

// Serve one team's Published MCP. With no `scopeSlug` this is the team's default
// Published MCP (served at / and /[teamSlug]); with a slug it is the named one at
// /[teamSlug]/[slug]. Only that endpoint's members — individual connections and
// tenanted groups — are exposed. The handler endpoint matches the incoming path
// (so it works behind a middleware rewrite) and the principal is narrowed to
// `teamId`.
export async function serveTeamMcp(req: Request, teamId: string, scopeSlug?: string) {
  const scope = await resolveScope(teamId, scopeSlug);
  if (!scope) {
    return NextResponse.json({ error: "unknown scope" }, { status: 404 });
  }

  const connections = [...scope.connections].sort((a, b) => a.name.localeCompare(b.name));
  const groups = [...scope.groups].sort((a, b) => a.name.localeCompare(b.name));

  // Credentials are all-or-nothing per bundle; the vault each sits in is
  // ignored. The tools still filter by vault id, so pass every team vault.
  const teamVaults = exposesCredentials(scope)
    ? await prisma.vault.findMany({ where: { teamId, credentials: { some: {} } }, select: { id: true } })
    : [];
  const vaultFilter = { allowedVaultIds: teamVaults.map((v) => v.id) };

  const instructions = renderRootInstructions(
    groups.map((g) => ({
      name: g.name,
      slug: g.slug,
      tenants: g.tenants.map((c) => ({ id: c.slug, name: c.name })),
    })),
    connections.map((c) => ({ name: c.name, slug: c.slug })),
    teamVaults.length > 0,
    [],
    scope.bots.map((b) => ({ name: b.name, platform: b.platform, username: b.username, description: b.description })),
    scope.serviceConnections.map((c) => ({ name: c.name, type: c.type })),
  );

  const endpoint = new URL(req.url).pathname;
  return buildMcpHandler(groups, connections, [], instructions, {
    endpoint,
    teamScope: teamId,
    vaultFilter,
    botIds: scope.bots.map((b) => b.id),
    scopeId: scope.id,
    serviceConnections: scope.serviceConnections,
  })(req);
}

// A handler that requires a bearer but serves nothing — used when we cannot pick
// a team (no/invalid bearer). withMcpAuth returns 401 for a missing/bad token.
export function serveUnauthenticatedMcp(req: Request) {
  const endpoint = new URL(req.url).pathname;
  return buildMcpHandler([], [], [], undefined, { endpoint })(req);
}
