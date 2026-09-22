import { prisma } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/team";
import { SettingsView, type MemberRow, type ServiceAccountRow } from "./SettingsView";

export default async function TeamSettingsPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeam(teamSlug);

  const [memberships, serviceAccounts] = await Promise.all([
    prisma.teamMembership.findMany({
      where: { teamId: team.id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.serviceAccount.findMany({
      where: { teamId: team.id },
      orderBy: { createdAt: "asc" },
      include: {
        keys: { where: { revokedAt: null }, select: { id: true } },
      },
    }),
  ]);

  const members: MemberRow[] = memberships.map((m) => ({
    id: m.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
  }));

  const accounts: ServiceAccountRow[] = serviceAccounts.map((sa) => ({
    id: sa.id,
    name: sa.name,
    activeKeyCount: sa.keys.length,
    createdAt: sa.createdAt.toISOString(),
  }));

  return (
    <SettingsView
      teamName={team.name}
      slug={team.slug}
      members={members}
      serviceAccounts={accounts}
    />
  );
}
