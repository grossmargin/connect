// Fetches a live OAuth access token from Nango. Nango refreshes the token
// server-side on every GET, so we never store or rotate it ourselves.

const NANGO_HOST = process.env.NANGO_HOST || "https://api.nango.dev";

// Pointer stored in Credential.credentialRef for a NANGO credential.
export type NangoRef = {
  connectionId: string;
  providerConfigKey: string;
};

export type NangoToken = {
  accessToken: string;
  realmId: string | null;
  expiresAt: string | null;
};

export function parseNangoRef(ref: unknown): NangoRef | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as Record<string, unknown>;
  if (typeof r.connectionId !== "string" || typeof r.providerConfigKey !== "string") return null;
  return { connectionId: r.connectionId, providerConfigKey: r.providerConfigKey };
}

export class NangoError extends Error {}

// Returns a currently-valid access token. Throws NangoError with a readable
// message on misconfiguration or when the connection needs re-authorization.
export async function fetchNangoToken(ref: NangoRef): Promise<NangoToken> {
  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) throw new NangoError("NANGO_SECRET_KEY is not set");

  const url = `${NANGO_HOST}/connection/${encodeURIComponent(ref.connectionId)}?provider_config_key=${encodeURIComponent(ref.providerConfigKey)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
  } catch (e) {
    throw new NangoError(`Nango request failed: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 400 || res.status === 404) {
      throw new NangoError(
        `Nango connection "${ref.connectionId}" (${ref.providerConfigKey}) is unavailable — it may need re-authorization. HTTP ${res.status}. ${body}`,
      );
    }
    throw new NangoError(`Nango returned HTTP ${res.status}. ${body}`);
  }

  const data = (await res.json()) as {
    credentials?: { access_token?: string; expires_at?: string };
    connection_config?: { realmId?: string };
  };
  const accessToken = data.credentials?.access_token;
  if (!accessToken) throw new NangoError("Nango response has no access_token");

  return {
    accessToken,
    realmId: data.connection_config?.realmId ?? null,
    expiresAt: data.credentials?.expires_at ?? null,
  };
}
