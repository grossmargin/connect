import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// A published MCP scope with the toolsets (and their connections) it exposes.
export type ScopeWithToolsets = Prisma.McpScopeGetPayload<{
  include: { toolsets: { include: { connections: true } } };
}>;

const DEFAULT_INCLUDE = { toolsets: { include: { connections: true } } } as const;

// The team's default scope (served at the team root). Created on first use with
// every existing toolset attached, so the root keeps serving what it did before
// scopes existed. New toolsets are not auto-published — they're added to a scope
// explicitly.
export async function getOrCreateDefaultScope(teamId: string): Promise<ScopeWithToolsets> {
  const existing = await prisma.mcpScope.findFirst({
    where: { teamId, isDefault: true },
    include: DEFAULT_INCLUDE,
  });
  if (existing) return existing;

  const toolsets = await prisma.mcpToolset.findMany({ where: { teamId }, select: { id: true } });
  try {
    return await prisma.mcpScope.create({
      data: {
        teamId,
        name: "Default",
        slug: "",
        isDefault: true,
        toolsets: { connect: toolsets.map((t) => ({ id: t.id })) },
      },
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

// The scope published at a given path segment, or the default scope when no
// segment is given. Returns null for an unknown named scope.
export async function resolveScope(
  teamId: string,
  scopeSlug?: string | null,
): Promise<ScopeWithToolsets | null> {
  if (!scopeSlug) return getOrCreateDefaultScope(teamId);
  return prisma.mcpScope.findUnique({
    where: { teamId_slug: { teamId, slug: scopeSlug } },
    include: DEFAULT_INCLUDE,
  });
}
