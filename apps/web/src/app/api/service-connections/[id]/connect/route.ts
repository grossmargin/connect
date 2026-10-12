import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/server/db";
import { userInTeam } from "@/lib/server/access";
import { isUuid } from "@/lib/isomorphic/ids";
import { requestOrigin } from "@/lib/server/serverEnv";
import { authorizeUrl, signState } from "@/lib/server/serviceOAuth";

export const dynamic = "force-dynamic";

// Starts the OAuth consent for one service connection: redirects the browser
// to Google or Intuit with the scopes the connection asks for.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = requestOrigin((n) => req.headers.get(n));
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.redirect(`${origin}/login`);
  if (!isUuid(id)) return new Response("not found", { status: 404 });

  const conn = await prisma.serviceConnection.findUnique({ where: { id }, include: { team: { select: { slug: true } } } });
  if (!conn || !(await userInTeam(userId, conn.teamId))) return new Response("not found", { status: 404 });

  try {
    return NextResponse.redirect(authorizeUrl(conn, origin, signState(conn.id, userId)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.redirect(`${origin}/${conn.team.slug}/service-connections?error=${encodeURIComponent(msg)}`);
  }
}
