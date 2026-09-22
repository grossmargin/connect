import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { getTeamByIdOrSlug } from "@/lib/server/team";
import { AppShell } from "@/ui/components/AppShell";

export default async function TeamLayout({
  params,
  children,
}: {
  params: Promise<{ teamIdOrSlug: string }>;
  children: React.ReactNode;
}) {
  const { teamIdOrSlug: teamSlug } = await params;
  const team = await getTeamByIdOrSlug(teamSlug);
  if (!team) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, team.id))) notFound();

  const teamId = team.id;
  const [connections, scopes] = await Promise.all([
    prisma.mcpConnection.count({ where: { teamId } }),
    prisma.mcpScope.count({ where: { teamId } }),
  ]);

  return (
    <AppShell
      teamId={team.id}
      teamSlug={team.slug}
      teamName={team.name}
      userName={user.name}
      email={user.email}
      counts={{ connections, scopes }}
    >
      {children}
    </AppShell>
  );
}
