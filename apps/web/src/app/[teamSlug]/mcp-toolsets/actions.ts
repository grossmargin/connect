"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { slugify } from "@/lib/slug";
import { readCredentials, packCredentials } from "@/lib/mcpCredentials";
import { resolveAuthHeaders, type ToolInfo } from "@/lib/mcpClient";
import { McpAggregator, type AggregateMember } from "@/lib/mcpAggregator";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error";
}

async function requireMember(teamId: string) {
  const user = await requireUser();
  if (!isUuid(teamId) || !(await userInTeam(user.id, teamId))) throw new Error("not found");
  return user;
}

// Keeps only the connection ids that belong to this team.
async function teamConnectionIds(teamId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.mcpConnection.findMany({
    where: { teamId, id: { in: ids.filter(isUuid) } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function createToolset(
  teamId: string,
  name: string,
  connectionIds: string[],
): Promise<{ id: string } | { error: string }> {
  const user = await requireMember(teamId);
  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Name is required." };

  const ids = await teamConnectionIds(teamId, connectionIds);
  try {
    const toolset = await prisma.mcpToolset.create({
      data: {
        teamId,
        name: trimmedName,
        slug: slugify(trimmedName),
        createdById: user.id,
        connections: { connect: ids.map((id) => ({ id })) },
      },
    });
    revalidatePath(`/${teamId}/mcp-toolsets`);
    return { id: toolset.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "An id derived from this name already exists. Pick another name." };
    }
    return { error: errorMessage(e) };
  }
}

export async function updateToolset(
  teamId: string,
  toolsetId: string,
  name: string,
  slug: string,
  connectionIds: string[],
): Promise<{ error: string } | void> {
  await requireMember(teamId);
  const toolset = await prisma.mcpToolset.findUnique({ where: { id: toolsetId } });
  if (!toolset || toolset.teamId !== teamId) return { error: "not found" };

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Name is required." };
  const ids = await teamConnectionIds(teamId, connectionIds);

  try {
    await prisma.mcpToolset.update({
      where: { id: toolsetId },
      data: {
        name: trimmedName,
        slug: slugify(slug || trimmedName),
        connections: { set: ids.map((id) => ({ id })) },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That id is already in use." };
    }
    return { error: errorMessage(e) };
  }
  revalidatePath(`/${teamId}/mcp-toolsets`);
  revalidatePath(`/${teamId}/mcp-toolsets/${toolsetId}`);
}

export async function deleteToolset(teamId: string, toolsetId: string): Promise<void> {
  await requireMember(teamId);
  await prisma.mcpToolset.deleteMany({ where: { id: toolsetId, teamId } });
  revalidatePath(`/${teamId}/mcp-toolsets`);
}

// Builds the aggregate from the toolset's servers and verifies it: every server
// must be reachable and expose the same tools. Records the result.
export async function testToolset(
  teamId: string,
  toolsetId: string,
): Promise<{ tools: ToolInfo[]; instructions?: string; memberCount: number } | { error: string }> {
  await requireMember(teamId);
  const toolset = await prisma.mcpToolset.findUnique({
    where: { id: toolsetId },
    include: { connections: true },
  });
  if (!toolset || toolset.teamId !== teamId) return { error: "not found" };

  try {
    if (toolset.connections.length === 0) throw new Error("Toolset has no MCP servers.");

    const members: AggregateMember[] = [];
    for (const conn of toolset.connections) {
      const creds = readCredentials(conn.encryptedCredentials);
      if (!creds) {
        throw new Error(`"${conn.name}" is not registered.`);
      }
      let headers;
      try {
        const r = await resolveAuthHeaders(conn, creds);
        headers = r.headers;
        if (r.refreshedCreds) {
          await prisma.mcpConnection.update({
            where: { id: conn.id },
            data: { encryptedCredentials: packCredentials(r.refreshedCreds) },
          });
        }
      } catch {
        throw new Error(`"${conn.name}" is not authorized. Authorize it first.`);
      }
      members.push({ label: conn.name, url: conn.url, headers });
    }

    const result = await new McpAggregator(members).probe();
    await prisma.mcpToolset.update({
      where: { id: toolsetId },
      data: { lastTestOk: true, lastTestError: null, lastTestedAt: new Date() },
    });
    revalidatePath(`/${teamId}/mcp-toolsets`);
    return result;
  } catch (e) {
    const msg = errorMessage(e);
    await prisma.mcpToolset.update({
      where: { id: toolsetId },
      data: { lastTestOk: false, lastTestError: msg, lastTestedAt: new Date() },
    });
    revalidatePath(`/${teamId}/mcp-toolsets`);
    return { error: msg };
  }
}
