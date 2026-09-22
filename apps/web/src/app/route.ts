import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/server/db";
import { baseUrl } from "@/lib/server/oauth";
import { resolvePrincipal, type Principal } from "@/lib/server/mcp";
import { logMcpCall } from "@/lib/server/mcpLog";
import { serveTeamMcp, serveUnauthenticatedMcp } from "@/lib/server/mcpMount";

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

// The root MCP mount serves exactly one team. When the caller belongs to a
// single team we use it; otherwise we can't decide, so we error and point them
// at the per-team mount (/<teamSlug>). A service account is always one team.
async function serveMcp(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : undefined;
  const principal = bearer ? await resolvePrincipal(bearer) : null;

  // No/invalid token — let the MCP auth layer return a proper 401.
  if (!principal) return serveUnauthenticatedMcp(req);

  if (principal.teamIds.length !== 1) {
    const msg =
      principal.teamIds.length === 0
        ? "You are not a member of any team."
        : "You belong to multiple teams. Connect to a team explicitly at /<teamSlug>.";
    await logRejectedCall(req, principal, msg);
    return NextResponse.json({ error: "team_ambiguous", message: msg }, { status: 409 });
  }

  return serveTeamMcp(req, principal.teamIds[0]);
}

async function redirectBrowser(req: Request) {
  const base = baseUrl(req);
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${base}/login`);

  const membership = await prisma.teamMembership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { team: { select: { slug: true } } },
  });
  return NextResponse.redirect(membership ? `${base}/${membership.team.slug}` : `${base}/no-team`);
}

export async function GET(req: Request) {
  if (isMcpRequest(req)) return serveMcp(req);
  return redirectBrowser(req);
}

export const POST = serveMcp;
export const DELETE = serveMcp;
