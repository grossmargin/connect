import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { resolveUserTeamId } from "@/lib/server/team";
import { prisma } from "@/lib/server/db";
import { NoTeamCard } from "./NoTeamCard";

export default async function NoTeamPage() {
  const user = await requireUser();

  // Already in a team? Send them there instead of showing onboarding.
  const teamId = await resolveUserTeamId(user.id);
  if (teamId) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { slug: true } });
    if (team) redirect(`/${team.slug}`);
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center p-4">
      <NoTeamCard />
    </div>
  );
}
