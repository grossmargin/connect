import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/server/db";
import { userInTeam } from "@/lib/server/access";
import { AcceptInvite } from "./AcceptInvite";

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // Preserve the invite target across sign-in.
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=/invite/${code}`);

  const invite = await prisma.teamInvitation.findUnique({
    where: { code },
    include: { team: { select: { name: true, slug: true } } },
  });

  if (!invite) return <AcceptInvite status="invalid" />;

  const isMember = await userInTeam(session.user.id, invite.teamId);
  if (isMember) redirect(`/${invite.team.slug}`);
  if (invite.acceptedAt) return <AcceptInvite status="used" teamName={invite.team.name} />;

  return <AcceptInvite status="ok" teamName={invite.team.name} code={code} />;
}
