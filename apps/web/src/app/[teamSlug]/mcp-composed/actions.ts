"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { slugify } from "@/lib/slug";
import { buildComposedMcp, resolveRealms } from "@/lib/wrapperTools";
import { COMPOSED_MCP_TYPES } from "./constants";

type ToolInfo = { name: string; description?: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error";
}

async function requireMember(teamId: string) {
  const user = await requireUser();
  if (!isUuid(teamId) || !(await userInTeam(user.id, teamId))) throw new Error("not found");
  return user;
}

const isKnownType = (type: string) => COMPOSED_MCP_TYPES.some((t) => t.value === type);

// Keeps only the credential ids whose vault belongs to this team.
async function teamCredentialIds(teamId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.credential.findMany({
    where: { vault: { teamId }, id: { in: ids.filter(isUuid) } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function createWrapper(
  teamId: string,
  name: string,
  type: string,
  credentialIds: string[],
): Promise<{ id: string } | { error: string }> {
  const user = await requireMember(teamId);
  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Name is required." };
  if (!isKnownType(type)) return { error: "Unsupported type." };

  const ids = await teamCredentialIds(teamId, credentialIds);
  try {
    const wrapper = await prisma.mcpWrapper.create({
      data: {
        teamId,
        name: trimmedName,
        slug: slugify(trimmedName),
        type,
        createdById: user.id,
        credentials: { connect: ids.map((id) => ({ id })) },
      },
    });
    revalidatePath(`/${teamId}/mcp-composed`);
    return { id: wrapper.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "An id derived from this name already exists. Pick another name." };
    }
    return { error: errorMessage(e) };
  }
}

// Type is immutable after creation, so it is not editable here.
export async function updateWrapper(
  teamId: string,
  wrapperId: string,
  name: string,
  slug: string,
  credentialIds: string[],
): Promise<{ error: string } | void> {
  await requireMember(teamId);
  const wrapper = await prisma.mcpWrapper.findUnique({ where: { id: wrapperId } });
  if (!wrapper || wrapper.teamId !== teamId) return { error: "not found" };

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Name is required." };
  const ids = await teamCredentialIds(teamId, credentialIds);

  try {
    await prisma.mcpWrapper.update({
      where: { id: wrapperId },
      data: {
        name: trimmedName,
        slug: slugify(slug || trimmedName),
        credentials: { set: ids.map((id) => ({ id })) },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That id is already in use." };
    }
    return { error: errorMessage(e) };
  }
  revalidatePath(`/${teamId}/mcp-composed`);
  revalidatePath(`/${teamId}/mcp-composed/${wrapperId}`);
}

export async function deleteWrapper(teamId: string, wrapperId: string): Promise<void> {
  await requireMember(teamId);
  await prisma.mcpWrapper.deleteMany({ where: { id: wrapperId, teamId } });
  revalidatePath(`/${teamId}/mcp-composed`);
}

// Resolves the attached credentials to realms and builds the in-process MCP,
// confirming the wrapper is servable. Records the result. (There are no tools
// yet, so a healthy wrapper simply reports 0 tools.)
export async function testWrapper(
  teamId: string,
  wrapperId: string,
): Promise<{ tools: ToolInfo[]; instructions?: string; realmCount: number } | { error: string }> {
  await requireMember(teamId);
  const wrapper = await prisma.mcpWrapper.findUnique({
    where: { id: wrapperId },
    include: { credentials: true },
  });
  if (!wrapper || wrapper.teamId !== teamId) return { error: "not found" };

  try {
    const realms = await resolveRealms(wrapper);
    if (realms.length === 0) {
      throw new Error("No attached credential resolved to a QuickBooks company (accessToken + realmId).");
    }
    const mcp = buildComposedMcp(wrapper.type, realms);
    const tools = mcp.listTools();
    await prisma.mcpWrapper.update({
      where: { id: wrapperId },
      data: { lastTestOk: true, lastTestError: null, lastTestedAt: new Date() },
    });
    revalidatePath(`/${teamId}/mcp-composed`);
    return { tools, instructions: mcp.instructions(), realmCount: realms.length };
  } catch (e) {
    const msg = errorMessage(e);
    await prisma.mcpWrapper.update({
      where: { id: wrapperId },
      data: { lastTestOk: false, lastTestError: msg, lastTestedAt: new Date() },
    });
    revalidatePath(`/${teamId}/mcp-composed`);
    return { error: msg };
  }
}
