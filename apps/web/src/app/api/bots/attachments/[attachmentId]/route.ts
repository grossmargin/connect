import { auth } from "@/auth";
import { prisma } from "@/lib/server/db";
import { isUuid } from "@/lib/isomorphic/ids";
import { userInTeam } from "@/lib/server/access";
import { serverEnv } from "@/lib/server/serverEnv";
import { verifyAttachmentQuery } from "@/lib/server/attachmentLinks";

export const dynamic = "force-dynamic";

// Serves a stored attachment. Access: a signed link (from bots_get_attachment)
// or a signed-in member of the bot's team.
export async function GET(req: Request, ctx: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await ctx.params;
  if (!isUuid(attachmentId)) return new Response("not found", { status: 404 });

  const q = new URL(req.url).searchParams;
  const signed = q.has("sig");
  if (signed && !verifyAttachmentQuery(serverEnv.AUTH_SECRET, attachmentId, q.get("exp"), q.get("sig"))) {
    return new Response("link is invalid or expired", { status: 403 });
  }
  const userId = signed ? null : (await auth())?.user?.id;
  if (!signed && !userId) return new Response("unauthorized", { status: 401 });

  const a = await prisma.botAttachment.findUnique({
    where: { id: attachmentId },
    select: { content: true, fileName: true, mimeType: true, message: { select: { teamId: true } } },
  });
  if (!a?.content || (userId && !(await userInTeam(userId, a.message.teamId)))) {
    return new Response("not found", { status: 404 });
  }
  return new Response(a.content, {
    headers: {
      "content-type": a.mimeType ?? "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.fileName ?? attachmentId)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
    },
  });
}
