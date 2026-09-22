"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { auth } from "@/auth";
import { generateOpaqueToken } from "@/lib/server/tokens";
import { CODE_TTL_SEC } from "@/lib/server/oauth";

export type AuthzParams = {
  clientId: string;
  redirectUri: string;
  state?: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
};

const CONFIRM_PHRASE = "I understand";

// Called only after the user typed the confirmation phrase and clicked Approve.
export async function approveAuthorization(params: AuthzParams, typed: string) {
  if (typed.trim().toLowerCase() !== CONFIRM_PHRASE.toLowerCase()) {
    throw new Error("confirmation phrase mismatch");
  }
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Re-validate the client and redirect URI server-side.
  const client = await prisma.oAuthClient.findUnique({ where: { clientId: params.clientId } });
  if (!client || !client.redirectUris.includes(params.redirectUri)) {
    throw new Error("invalid client or redirect_uri");
  }

  const code = generateOpaqueToken("code");
  await prisma.oAuthAuthCode.create({
    data: {
      code,
      clientId: params.clientId,
      userId: session.user.id,
      redirectUri: params.redirectUri,
      scope: params.scope,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      expiresAt: new Date(Date.now() + CODE_TTL_SEC * 1000),
    },
  });

  redirect(withParams(params.redirectUri, { code, state: params.state }));
}

export async function denyAuthorization(params: AuthzParams) {
  redirect(withParams(params.redirectUri, { error: "access_denied", state: params.state }));
}

function withParams(uri: string, q: Record<string, string | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v);
  return u.toString();
}
