import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { auth } from "@/auth";
import { userInTeam } from "@/lib/server/access";
import { kvTake } from "@/lib/server/kv";
import { exchangeCode, tokensToCredentials } from "@/lib/server/mcpClient";
import { readCredentials, packCredentials } from "@/lib/server/mcpCredentials";
import { OAUTH_STATE_NS } from "@/app/[teamSlug]/mcp-connections/constants";
import { appUrl } from "@/lib/server/serverEnv";

function back(teamSlug: string, connectionId: string, params: Record<string, string>) {
  const u = new URL(`${appUrl()}/${teamSlug}/mcp-connections/${connectionId}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
}

type StateValue = { connectionId: string; codeVerifier: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  if (!state) return NextResponse.redirect(`${appUrl()}/`);

  // Consume the one-time state token (also yields its team).
  const entry = await kvTake<StateValue>(OAUTH_STATE_NS, state);
  if (!entry) return NextResponse.redirect(`${appUrl()}/`);
  const { teamId, value } = entry;

  const conn = await prisma.mcpConnection.findUnique({
    where: { id: value.connectionId },
    include: { team: { select: { slug: true } } },
  });
  if (!conn || conn.teamId !== teamId) return NextResponse.redirect(`${appUrl()}/`);
  const teamSlug = conn.team.slug;

  const session = await auth();
  if (!session?.user?.id || !(await userInTeam(session.user.id, teamId))) {
    return NextResponse.redirect(`${appUrl()}/login`);
  }

  if (oauthError) {
    await prisma.mcpConnection.update({
      where: { id: conn.id },
      data: { status: "ERROR", lastError: `Authorization denied: ${oauthError}` },
    });
    return back(teamSlug, conn.id, { error: oauthError });
  }
  if (!code) return back(teamSlug, conn.id, { error: "missing_code" });

  try {
    const creds = readCredentials(conn.encryptedCredentials);
    if (!creds || creds.authType !== "DCR") return back(teamSlug, conn.id, { error: "not_registered" });

    const tokens = await exchangeCode(conn, creds, code, value.codeVerifier);
    await prisma.mcpConnection.update({
      where: { id: conn.id },
      data: {
        status: "CONNECTED",
        lastError: null,
        lastConnectedAt: new Date(),
        encryptedCredentials: packCredentials(tokensToCredentials(creds, tokens)),
      },
    });
    return back(teamSlug, conn.id, { authorized: "1" });
  } catch (e) {
    await prisma.mcpConnection.update({
      where: { id: conn.id },
      data: { status: "ERROR", lastError: e instanceof Error ? e.message : "token exchange failed" },
    });
    return back(teamSlug, conn.id, { error: "exchange_failed" });
  }
}
