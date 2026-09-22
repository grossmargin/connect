import { prisma } from "@/lib/server/db";

// Generic per-user settings, keyed by (userId, key). Callers own the value shape.
export async function getUserSettings<T = unknown>(userId: string, key: string): Promise<T | null> {
  const row = await prisma.userSettings.findUnique({
    where: { userId_key: { userId, key } },
    select: { settings: true },
  });
  return (row?.settings as T) ?? null;
}

export async function setUserSettings(userId: string, key: string, settings: unknown): Promise<void> {
  await prisma.userSettings.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, settings: settings as object },
    update: { settings: settings as object },
  });
}

// ---------- Preferences ----------

const PREFS_KEY = "preferences";
type Preferences = { defaultTeamId?: string };

export async function getDefaultTeamId(userId: string): Promise<string | null> {
  const prefs = await getUserSettings<Preferences>(userId, PREFS_KEY);
  return prefs?.defaultTeamId ?? null;
}

export async function setDefaultTeamId(userId: string, teamId: string | null): Promise<void> {
  const prefs = (await getUserSettings<Preferences>(userId, PREFS_KEY)) ?? {};
  await setUserSettings(userId, PREFS_KEY, { ...prefs, defaultTeamId: teamId ?? undefined });
}
