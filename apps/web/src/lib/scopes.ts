import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// A Published MCP with the members it exposes: individual connections plus
// tenanted groups (and each group's tenant connections).
export type ScopeWithMembers = Prisma.McpScopeGetPayload<{
  include: { connections: true; groups: { include: { tenants: true } } };
}>;

const DEFAULT_INCLUDE = {
  connections: true,
  groups: { include: { tenants: true } },
} as const;

// The team's default Published MCP (served at the team root). Created empty on
// first use. Members are added explicitly.
export async function getOrCreateDefaultScope(teamId: string): Promise<ScopeWithMembers> {
  const existing = await prisma.mcpScope.findFirst({
    where: { teamId, isDefault: true },
    include: DEFAULT_INCLUDE,
  });
  if (existing) return existing;

  try {
    return await prisma.mcpScope.create({
      data: { teamId, name: "Default", slug: "", isDefault: true },
      include: DEFAULT_INCLUDE,
    });
  } catch (e) {
    // Lost a race to create it — fetch the winner.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const scope = await prisma.mcpScope.findFirst({
        where: { teamId, isDefault: true },
        include: DEFAULT_INCLUDE,
      });
      if (scope) return scope;
    }
    throw e;
  }
}

// The Published MCP at a given path segment, or the default one when no segment
// is given. Returns null for an unknown named endpoint.
export async function resolveScope(
  teamId: string,
  scopeSlug?: string | null,
): Promise<ScopeWithMembers | null> {
  if (!scopeSlug) return getOrCreateDefaultScope(teamId);
  return prisma.mcpScope.findUnique({
    where: { teamId_slug: { teamId, slug: scopeSlug } },
    include: DEFAULT_INCLUDE,
  });
}
