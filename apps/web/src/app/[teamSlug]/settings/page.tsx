import { prisma } from "@/lib/server/db";
import { requireTeam } from "@/lib/server/team";
import {
  SettingsView,
  type MemberRow,
  type ServiceAccountRow,
  type InvitationRow,
} from "./SettingsView";

export default async function TeamSettingsPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeam(teamSlug);

  const [memberships, serviceAccounts, invitations] = await Promise.all([
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
    prisma.teamInvitation.findMany({
      where: { teamId: team.id },
      orderBy: { createdAt: "desc" },
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

  const invites: InvitationRow[] = invitations.map((i) => ({
    id: i.id,
    email: i.email,
    acceptedAt: i.acceptedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  }));

  return (
    <SettingsView
      teamName={team.name}
      slug={team.slug}
      members={members}
      invitations={invites}
      serviceAccounts={accounts}
    />
  );
}
