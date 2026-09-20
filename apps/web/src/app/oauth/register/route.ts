import { prisma } from "@/lib/db";
import { generateOpaqueToken } from "@/lib/tokens";
import { OAUTH_SCOPE } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// RFC 7591 Dynamic Client Registration.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("invalid_client_metadata", "body must be JSON");
  }

  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every((u) => typeof u === "string")) {
    return err("invalid_redirect_uri", "redirect_uris is required");
  }

  const authMethod = (body.token_endpoint_auth_method as string) ?? "none";
  const isPublic = authMethod === "none";

  const clientId = generateOpaqueToken("client");
  const clientSecret = isPublic ? null : generateOpaqueToken("secret");
  const grantTypes = (body.grant_types as string[]) ?? ["authorization_code", "refresh_token"];

  await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecret,
      name: (body.client_name as string) ?? null,
      redirectUris: redirectUris as string[],
      grantTypes,
      scope: (body.scope as string) ?? OAUTH_SCOPE,
    },
  });

  return Response.json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      token_endpoint_auth_method: authMethod,
      scope: (body.scope as string) ?? OAUTH_SCOPE,
    },
    { status: 201 },
  );
}

function err(error: string, description: string) {
  return Response.json({ error, error_description: description }, { status: 400 });
}
