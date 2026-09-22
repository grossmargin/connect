import { NextResponse, type NextRequest } from "next/server";
import { isReservedSlug, isTeamSubroute } from "@/lib/isomorphic/reservedSlugs";

// `/<team>` is both a browser page (the team dashboard) and, for MCP clients,
// the per-team MCP mount — so we route MCP requests on that bare path to
// /<team>/mcp. Reserved top-level segments are never team slugs.

// An MCP client either GETs the SSE stream (Accept: text/event-stream) or
// POST/DELETEs JSON-RPC. A browser navigation is GET text/html; a React Server
// Action is a POST carrying a `next-action` header — neither is MCP.
function isMcpRequest(req: NextRequest): boolean {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/event-stream")) return true;
  if (req.method === "POST" || req.method === "DELETE") {
    return !req.headers.get("next-action");
  }
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const segments = pathname.split("/").filter(Boolean);

  // `/<teamSlug>` (default scope) and `/<teamSlug>/<scopeSlug>` (a named
  // published scope) both double as UI paths, so we only reroute the MCP
  // requests among them to the MCP handlers.
  let target: string | null = null;
  if (segments.length === 1) {
    const [team] = segments;
    if (!isReservedSlug(team) && isMcpRequest(req)) target = `/${team}/mcp`;
  } else if (segments.length === 2) {
    const [team, scopeSlug] = segments;
    if (!isReservedSlug(team) && !isTeamSubroute(scopeSlug) && isMcpRequest(req)) {
      target = `/${team}/mcp/${scopeSlug}`;
    }
  }
  if (!target) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next internals and static assets; the handler itself filters the rest.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
