"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { createTeam } from "@/lib/server/team";
import { setDefaultTeamId } from "@/lib/server/userSettings";
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

// Create a team owned by the current user. Returns the new slug so the client
// can navigate to it.
export async function createTeamAction(name: string): Promise<{ error: string } | { slug: string }> {
  const user = await requireUser();
  if (!name.trim()) return { error: "Enter a team name." };
  try {
    const team = await createTeam(user.id, name);
    return { slug: team.slug };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

// Accept a team invitation by its code. Adds the current user to the team
// (idempotent) and marks the single-use invite consumed. Returns the team slug.
export async function acceptInvitation(code: string): Promise<{ error: string } | { slug: string }> {
  const user = await requireUser();
  const invite = await prisma.teamInvitation.findUnique({
    where: { code },
    include: { team: { select: { id: true, slug: true } } },
  });
  if (!invite) return { error: "This invitation link is invalid." };

  const already = await userInTeam(user.id, invite.teamId);
  if (already) return { slug: invite.team.slug };
  if (invite.acceptedAt) return { error: "This invitation link has already been used." };

  await prisma.$transaction([
    prisma.teamMembership.create({
      data: { userId: user.id, teamId: invite.teamId, role: invite.role },
    }),
    prisma.teamInvitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedById: user.id },
    }),
  ]);
  revalidatePath(`/${invite.team.slug}`);
  return { slug: invite.team.slug };
}

// Set (or clear) the current user's default team — the team the root MCP mount
// and post-login redirect resolve to.
export async function setDefaultTeamAction(
  teamId: string | null,
): Promise<{ error: string } | { ok: true }> {
  const user = await requireUser();
  if (teamId && !(await userInTeam(user.id, teamId))) return { error: "not found" };
  await setDefaultTeamId(user.id, teamId);
  revalidatePath("/account");
  return { ok: true };
}
