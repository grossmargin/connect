import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/server/db";
import { baseUrl } from "@/lib/server/oauth";
import { resolvePrincipal, type Principal } from "@/lib/server/mcp";
import { logMcpCall } from "@/lib/server/mcpLog";
import { serveTeamMcp, serveUnauthenticatedMcp } from "@/lib/server/mcpMount";
import { resolveUserTeamId } from "@/lib/server/team";

// Log a tools/call we reject before the MCP handler runs (e.g. team ambiguous),
// so auth/routing failures aren't invisible. Best-effort; reads the JSON-RPC
// body from a clone so the original request is untouched. Needs a principal to
// attribute the actor — anonymous (401) calls can't be logged.
async function logRejectedCall(req: Request, principal: Principal, error: string) {
  try {
    const body = await req.clone().json();
    if (body?.method !== "tools/call") return;
    const name = body?.params?.name;
    if (typeof name !== "string") return;
    const args = body?.params?.arguments;
    await logMcpCall(principal, {
      source: "root",
      toolName: name,
      args,
      tenant: typeof args?.tenant === "string" ? args.tenant : null,
      ok: false,
      error,
    });
  } catch {
    // ignore — logging must never break the response
  }
}

// The root serves the MCP server for MCP clients and redirects browsers.
// MCP clients send `Accept: text/event-stream` (GET SSE stream) or POST
// JSON-RPC; browsers navigate with `Accept: text/html`.
function isMcpRequest(req: Request): boolean {
  return (req.headers.get("accept") ?? "").includes("text/event-stream");
}

// The root MCP mount serves one team, picked for the caller: a service account
// is always single-team; a user gets their default team, else their oldest
// team. A named endpoint (/<teamSlug>) still overrides this. Only a caller with
// no team at all is rejected.
async function serveMcp(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : undefined;
  const principal = bearer ? await resolvePrincipal(bearer) : null;

  // No/invalid token — let the MCP auth layer return a proper 401.
  if (!principal) return serveUnauthenticatedMcp(req);

  const teamId =
    principal.kind === "sa" ? principal.teamIds[0] : await resolveUserTeamId(principal.userId);

  if (!teamId) {
    const msg = "You are not a member of any team.";
    await logRejectedCall(req, principal, msg);
    return NextResponse.json({ error: "no_team", message: msg }, { status: 409 });
  }

  return serveTeamMcp(req, teamId);
}

async function redirectBrowser(req: Request) {
  const base = baseUrl(req);
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${base}/login`);

  const teamId = await resolveUserTeamId(session.user.id);
  if (!teamId) return NextResponse.redirect(`${base}/no-team`);
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { slug: true } });
  return NextResponse.redirect(team ? `${base}/${team.slug}` : `${base}/no-team`);
}

export async function GET(req: Request) {
  if (isMcpRequest(req)) return serveMcp(req);
  return redirectBrowser(req);
}

export const POST = serveMcp;
export const DELETE = serveMcp;
