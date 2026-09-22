import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam, userIsTeamAdmin } from "@/lib/server/access";
import { getTeamBySlug, userTeams } from "@/lib/server/team";
import { AppShell } from "@/ui/components/AppShell";

export default async function TeamLayout({
  params,
  children,
}: {
  params: Promise<{ teamSlug: string }>;
  children: React.ReactNode;
}) {
  const { teamSlug } = await params;
  const team = await getTeamBySlug(teamSlug);
  if (!team) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, team.id))) notFound();

  const teamId = team.id;
  const [connections, scopes, isAdmin, teams] = await Promise.all([
    prisma.mcpConnection.count({ where: { teamId } }),
    prisma.mcpScope.count({ where: { teamId } }),
    userIsTeamAdmin(user.id, teamId),
    userTeams(user.id),
  ]);

  return (
    <AppShell
      teamId={team.id}
      teamSlug={team.slug}
      teamName={team.name}
      teams={teams}
      userName={user.name}
      email={user.email}
      counts={{ connections, scopes }}
      isAdmin={isAdmin}
    >
      {children}
    </AppShell>
  );
}
