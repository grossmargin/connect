import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { getTeamBySlug } from "@/lib/server/team";
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
