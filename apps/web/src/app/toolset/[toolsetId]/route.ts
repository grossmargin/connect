import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { buildToolsetHandler } from "@/lib/toolsetServer";

// Each toolset is its own MCP endpoint at /toolset/<id>. Auth (bearer +
// team check) is enforced inside the built handler.
async function handle(req: Request, ctx: { params: Promise<{ toolsetId: string }> }) {
  const { toolsetId } = await ctx.params;
  if (!isUuid(toolsetId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const toolset = await prisma.mcpToolset.findUnique({
    where: { id: toolsetId },
    include: { connections: true },
  });
  if (!toolset) return NextResponse.json({ error: "not found" }, { status: 404 });

  return buildToolsetHandler(toolset)(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
