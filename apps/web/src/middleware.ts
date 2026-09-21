import { NextResponse, type NextRequest } from "next/server";
import { isReservedSlug } from "@/lib/reservedSlugs";

// `/<teamSlug>` is both a browser page (the team dashboard) and, for MCP
// clients, the per-team MCP mount — so we route MCP requests on that bare path
// to /mcp/<teamSlug>. Reserved top-level segments are never team slugs.

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

  // Only the bare, single-segment `/<slug>` is an ambiguous UI/MCP path.
  if (segments.length !== 1) return NextResponse.next();
  const seg = segments[0];
  if (isReservedSlug(seg)) return NextResponse.next();
  if (!isMcpRequest(req)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/mcp/${seg}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next internals and static assets; the handler itself filters the rest.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
