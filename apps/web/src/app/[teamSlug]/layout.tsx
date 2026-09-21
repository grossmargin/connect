import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { getTeamBySlug } from "@/lib/team";
import { AppShell } from "../AppShell";

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
  const [connections, toolsets, scopes] = await Promise.all([
    prisma.mcpConnection.count({ where: { teamId } }),
    prisma.mcpToolset.count({ where: { teamId } }),
    prisma.mcpScope.count({ where: { teamId } }),
  ]);

  return (
    <AppShell
      teamId={team.id}
      teamSlug={team.slug}
      teamName={team.name}
      userName={user.name}
      email={user.email}
      counts={{ connections, toolsets, scopes }}
    >
      {children}
    </AppShell>
  );
}
