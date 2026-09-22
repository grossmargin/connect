import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Card, Result } from "antd";
import { prisma } from "@/lib/server/db";
import { auth } from "@/auth";
import { OAUTH_SCOPE } from "@/lib/server/oauth";
import { serverEnv } from "@/lib/server/serverEnv";
import { ConsentForm } from "./ConsentForm";

type SP = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

async function baseUrl(): Promise<string> {
  if (serverEnv.APP_URL) return serverEnv.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function errorCard(title: string, sub: string) {
  return (
    <div className="grid min-h-[100dvh] place-items-center p-4">
      <Card className="w-[460px]">
        <Result status="error" title={title} subTitle={sub} />
      </Card>
    </div>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const clientId = one(sp.client_id);
  const redirectUri = one(sp.redirect_uri);
  const responseType = one(sp.response_type);
  const codeChallenge = one(sp.code_challenge);
  const codeChallengeMethod = one(sp.code_challenge_method) ?? "plain";
  const state = one(sp.state);
  const scope = one(sp.scope) ?? OAUTH_SCOPE;

  if (!clientId || !redirectUri) return errorCard("Invalid request", "client_id and redirect_uri are required.");

  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) return errorCard("Unknown client", "This application is not registered.");
  if (!client.redirectUris.includes(redirectUri)) {
    return errorCard("Invalid redirect URI", "The redirect URI is not registered for this application.");
  }

  // Past this point redirect_uri is trusted, so protocol errors go back to the client.
  if (responseType !== "code") redirect(back(redirectUri, { error: "unsupported_response_type", state }));
  if (!codeChallenge) redirect(back(redirectUri, { error: "invalid_request", error_description: "code_challenge required", state }));

  const session = await auth();
  if (!session?.user?.id) {
    const base = await baseUrl();
    const self = new URL(`${base}/oauth/authorize`);
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") self.searchParams.set(k, v);
    redirect(`/login?callbackUrl=${encodeURIComponent(self.toString())}`);
  }

  const base = await baseUrl();
  return (
    <ConsentForm
      clientName={client.name || clientId}
      resource={`${base}/mcp`}
      params={{ clientId, redirectUri, state, scope, codeChallenge: codeChallenge!, codeChallengeMethod }}
    />
  );
}

function back(uri: string, q: Record<string, string | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v);
  return u.toString();
}
