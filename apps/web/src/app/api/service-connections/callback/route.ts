import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/server/db";
import { userInTeam } from "@/lib/server/access";
import { requestOrigin } from "@/lib/server/serverEnv";
import { completeOAuth, testServiceConnection, verifyState } from "@/lib/server/serviceOAuth";

export const dynamic = "force-dynamic";

// OAuth redirect target for Google and Intuit. The signed state names the
// connection and the user who started the flow; that user must still be signed in.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = requestOrigin((n) => req.headers.get(n));
  const state = verifyState(url.searchParams.get("state"));
  if (!state) return new Response("Invalid or expired state. Start the connection again.", { status: 400 });

  const session = await auth();
  if (session?.user?.id !== state.uid) return new Response("Signed-in user does not match.", { status: 403 });

  const conn = await prisma.serviceConnection.findUnique({
    where: { id: state.id },
    include: { team: { select: { slug: true } } },
  });
  if (!conn || !(await userInTeam(state.uid, conn.teamId))) return new Response("not found", { status: 404 });

  const back = `${origin}/${conn.team.slug}/service-connections`;
  try {
    const saved = await completeOAuth(conn, origin, url.searchParams);
    await testServiceConnection(saved);
    return NextResponse.redirect(`${back}?connected=${encodeURIComponent(conn.name)}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.redirect(`${back}?error=${encodeURIComponent(msg)}`);
  }
}
