import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { AppShell } from "../AppShell";

export default async function TeamLayout({
  params,
  children,
}: {
  params: Promise<{ teamId: string }>;
  children: React.ReactNode;
}) {
  const { teamId } = await params;
  if (!isUuid(teamId)) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, teamId))) notFound();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) notFound();

  const [connections, toolsets, wrappers] = await Promise.all([
    prisma.mcpConnection.count({ where: { teamId } }),
    prisma.mcpToolset.count({ where: { teamId } }),
    prisma.mcpWrapper.count({ where: { teamId } }),
  ]);

  return (
    <AppShell
      teamId={team.id}
      teamName={team.name}
      userName={user.name}
      email={user.email}
      counts={{ connections, toolsets, wrappers }}
    >
      {children}
    </AppShell>
  );
}
