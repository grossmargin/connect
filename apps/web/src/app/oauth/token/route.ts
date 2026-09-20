import { prisma } from "@/lib/db";
import { hashToken, generateOpaqueToken } from "@/lib/tokens";
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC, verifyPkce } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = new URLSearchParams(await req.text());
  const grantType = form.get("grant_type");

  if (grantType === "authorization_code") return authorizationCode(form);
  if (grantType === "refresh_token") return refreshToken(form);
  return tokenErr("unsupported_grant_type");
}

async function authorizationCode(form: URLSearchParams) {
  const code = form.get("code");
  const redirectUri = form.get("redirect_uri");
  const clientId = form.get("client_id");
  const codeVerifier = form.get("code_verifier");
  if (!code || !redirectUri || !clientId || !codeVerifier) return tokenErr("invalid_request");

  const client = await authClient(clientId, form);
  if (!client) return tokenErr("invalid_client");

  const authCode = await prisma.oAuthAuthCode.findUnique({ where: { code } });
  if (!authCode || authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
    return tokenErr("invalid_grant");
  }
  // Single use.
  await prisma.oAuthAuthCode.delete({ where: { id: authCode.id } });
  if (authCode.expiresAt < new Date()) return tokenErr("invalid_grant", "code expired");
  if (!verifyPkce(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
    return tokenErr("invalid_grant", "PKCE check failed");
  }

  return issue(clientId, authCode.userId, authCode.scope);
}

async function refreshToken(form: URLSearchParams) {
  const refresh = form.get("refresh_token");
  const clientId = form.get("client_id");
  if (!refresh || !clientId) return tokenErr("invalid_request");

  const client = await authClient(clientId, form);
  if (!client) return tokenErr("invalid_client");

  const existing = await prisma.oAuthToken.findUnique({ where: { refreshTokenHash: hashToken(refresh) } });
  if (!existing || existing.clientId !== clientId || existing.revokedAt) return tokenErr("invalid_grant");
  if (existing.refreshExpiresAt && existing.refreshExpiresAt < new Date()) return tokenErr("invalid_grant");

  // Rotate.
  await prisma.oAuthToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  return issue(clientId, existing.userId, existing.scope);
}

// Confidential clients must present a matching secret; public (PKCE) clients need none.
async function authClient(clientId: string, form: URLSearchParams) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) return null;
  if (client.clientSecret && client.clientSecret !== form.get("client_secret")) return null;
  return client;
}

async function issue(clientId: string, userId: string, scope: string | null) {
  const accessToken = generateOpaqueToken("at");
  const refreshTokenValue = generateOpaqueToken("rt");
  await prisma.oAuthToken.create({
    data: {
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshTokenValue),
      clientId,
      userId,
      scope,
      accessExpiresAt: new Date(Date.now() + ACCESS_TTL_SEC * 1000),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
    },
  });

  return Response.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SEC,
      refresh_token: refreshTokenValue,
      scope: scope ?? undefined,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function tokenErr(error: string, description?: string) {
  return Response.json({ error, error_description: description }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
