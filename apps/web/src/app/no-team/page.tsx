import { redirect } from "next/navigation";
import { Card, Typography } from "antd";
import { requireUser } from "@/lib/server/session";
import { resolveUserTeamId } from "@/lib/server/team";
import { prisma } from "@/lib/server/db";
import { CreateTeamForm } from "@/ui/components/CreateTeam";

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
      <Card className="w-96">
        <Typography.Title level={4} className="!mb-1">
          Create your team
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!mb-4">
          You are not in a team yet. Create one to get started, or ask an admin for an invite link.
        </Typography.Paragraph>
        <CreateTeamForm />
      </Card>
    </div>
  );
}
