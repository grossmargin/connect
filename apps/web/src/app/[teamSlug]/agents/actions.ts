"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { isUuid } from "@/lib/isomorphic/ids";
import { normalizeTelegramContext } from "@/lib/isomorphic/agentContext";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error";
}

async function requireMember(teamId: string) {
  const user = await requireUser();
  if (!isUuid(teamId) || !(await userInTeam(user.id, teamId))) throw new Error("not found");
  return user;
}

export async function createAgent(teamId: string, name: string): Promise<{ id: string } | { error: string }> {
  const user = await requireMember(teamId);
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };
  const agent = await prisma.agent.create({ data: { teamId, name: trimmed, createdById: user.id } });
  return { id: agent.id };
}

export type AgentInput = {
  name: string;
  systemPromptUrl: string;
  scopeIds: string[];
  // Context shape depends on the bot's platform.
  bots: { botId: string; context: unknown }[];
};

// Saves the whole agent. The bot list replaces the current one.
export async function updateAgent(
  teamId: string,
  agentId: string,
  input: AgentInput,
): Promise<{ error: string } | void> {
  await requireMember(teamId);
  const agent = await prisma.agent.findFirst({ where: { id: agentId, teamId }, select: { id: true } });
  if (!agent) return { error: "not found" };

  const name = input.name.trim();
  if (!name) return { error: "Name is required." };

  const url = input.systemPromptUrl.trim();
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    } catch {
      return { error: "System prompt must be a valid http(s) URL." };
    }
  }

  const teamBots = await prisma.bot.findMany({
    where: { teamId, id: { in: input.bots.map((b) => b.botId) } },
    select: { id: true, name: true, platform: true },
  });
  const botById = new Map(teamBots.map((b) => [b.id, b]));
  const links: Prisma.AgentBotCreateManyInput[] = [];
  for (const b of input.bots) {
    const bot = botById.get(b.botId);
    if (!bot) return { error: "Bot not found." };
    if (links.some((l) => l.botId === bot.id)) continue;
    let context: Prisma.InputJsonValue = {};
    if (bot.platform === "telegram") {
      try {
        context = normalizeTelegramContext(b.context);
      } catch (e) {
        return { error: `${bot.name}: ${errorMessage(e)}` };
      }
    }
    links.push({ agentId: agent.id, botId: bot.id, context });
  }

  const scopes = await prisma.mcpScope.findMany({
    where: { teamId, id: { in: input.scopeIds } },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.agent.update({
      where: { id: agent.id },
      data: { name, systemPromptUrl: url || null, scopes: { set: scopes.map((s) => ({ id: s.id })) } },
    }),
    prisma.agentBot.deleteMany({ where: { agentId: agent.id } }),
    prisma.agentBot.createMany({ data: links }),
  ]);
}

export async function deleteAgent(teamId: string, agentId: string): Promise<void> {
  await requireMember(teamId);
  await prisma.agent.deleteMany({ where: { id: agentId, teamId } });
}
