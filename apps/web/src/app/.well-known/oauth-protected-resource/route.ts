import { baseUrl, OAUTH_SCOPE } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const base = baseUrl(req);
  return Response.json({
    resource: base,
    authorization_servers: [base],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
  });
}
