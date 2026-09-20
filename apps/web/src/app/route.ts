import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { baseUrl } from "@/lib/oauth";
import { resolvePrincipal } from "@/lib/mcp";
import { buildMcpHandler } from "@/lib/mcpServer";
import { renderRootInstructions } from "@/lib/mcpInstructions";

// The root serves the MCP server for MCP clients and redirects browsers.
// MCP clients send `Accept: text/event-stream` (GET SSE stream) or POST
// JSON-RPC; browsers navigate with `Accept: text/html`.
function isMcpRequest(req: Request): boolean {
  return (req.headers.get("accept") ?? "").includes("text/event-stream");
}

// The root server exposes the caller's toolsets, so we resolve the principal and
// load them (with connections) before building the handler.
async function serveMcp(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : undefined;
  const principal = bearer ? await resolvePrincipal(bearer) : null;

  const toolsets = principal
    ? await prisma.mcpToolset.findMany({
        where: { teamId: { in: principal.teamIds } },
        orderBy: { name: "asc" },
        include: { connections: true },
      })
    : [];

  const wrappers = principal
    ? await prisma.mcpWrapper.findMany({
        where: { teamId: { in: principal.teamIds } },
        orderBy: { name: "asc" },
        include: { credentials: true },
      })
    : [];

  const vaults = principal
    ? await prisma.vault.findMany({
        where: { teamId: { in: principal.teamIds } },
        orderBy: { name: "asc" },
        select: { name: true, description: true },
      })
    : [];

  const instructions = renderRootInstructions(
    toolsets.map((t) => ({
      name: t.name,
      slug: t.slug,
      tenants: t.connections.map((c) => ({ id: c.slug, name: c.name })),
    })),
    vaults,
    wrappers.map((w) => ({ name: w.name, slug: w.slug, type: w.type })),
  );

  return buildMcpHandler(toolsets, wrappers, instructions)(req);
}

async function redirectBrowser(req: Request) {
  const base = baseUrl(req);
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${base}/login`);

  const membership = await prisma.teamMembership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { teamId: true },
  });
  return NextResponse.redirect(membership ? `${base}/${membership.teamId}` : `${base}/no-team`);
}

export async function GET(req: Request) {
  if (isMcpRequest(req)) return serveMcp(req);
  return redirectBrowser(req);
}

export const POST = serveMcp;
export const DELETE = serveMcp;
