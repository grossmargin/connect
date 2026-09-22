"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { signIn, signOut } from "@/auth";

export async function googleSignIn(callbackUrl?: string) {
  await signIn("google", { redirectTo: callbackUrl || "/" });
}

export async function createVault(teamId: string, name: string, description: string) {
  const user = await requireUser();
  if (!name.trim() || !teamId) return;
  if (!(await userInTeam(user.id, teamId))) return;

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { slug: true } });
  if (!team) return;

  const vault = await prisma.vault.create({
    data: { teamId, name: name.trim(), description: description.trim() || null },
  });
  revalidatePath(`/${team.slug}`);
  redirect(`/${team.slug}/vaults/${vault.id}`);
}

export async function doSignOut() {
  await signOut({ redirectTo: "/login" });
}
