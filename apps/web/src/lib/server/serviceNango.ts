import "server-only";
import { http } from "@/lib/server/http";
import type { NangoServiceConfig } from "@/lib/isomorphic/serviceConnectionTypes";

// Nango API calls for a Nango service connection (host + secret key from the
// row, not from env). See https://nango.dev/docs/reference/api

export type NangoConnectionSummary = {
  connection_id: string;
  provider: string | null;
  provider_config_key: string;
  created: string | null;
  end_user: { id?: string; email?: string | null; display_name?: string | null } | null;
};

export type NangoCredentials = {
  credentials: Record<string, unknown>;
  connection_config: Record<string, unknown>;
};

async function nangoGet(cfg: NangoServiceConfig, path: string): Promise<unknown> {
  let res;
  try {
    res = await http.get(`${cfg.host}${path}`, { headers: { Authorization: `Bearer ${cfg.secretKey}` } });
  } catch (e) {
    throw new Error(`Nango request failed: ${(e as Error).message}`);
  }
  if (res.status < 200 || res.status >= 300) {
    const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
    throw new Error(`Nango returned HTTP ${res.status}. ${body}`);
  }
  return res.data;
}

export async function listNangoConnections(cfg: NangoServiceConfig): Promise<NangoConnectionSummary[]> {
  const data = (await nangoGet(cfg, "/connection")) as { connections?: Array<Record<string, unknown>> };
  return (data.connections ?? []).map((c) => ({
    connection_id: String(c.connection_id ?? ""),
    provider: typeof c.provider === "string" ? c.provider : null,
    provider_config_key: String(c.provider_config_key ?? ""),
    created: typeof c.created === "string" ? c.created : null,
    end_user: c.end_user && typeof c.end_user === "object" ? (c.end_user as NangoConnectionSummary["end_user"]) : null,
  }));
}

// Nango refreshes OAuth tokens on this call, so the result is ready to use.
export async function getNangoCredentials(
  cfg: NangoServiceConfig,
  connectionId: string,
  providerConfigKey: string,
): Promise<NangoCredentials> {
  const data = (await nangoGet(
    cfg,
    `/connection/${encodeURIComponent(connectionId)}?provider_config_key=${encodeURIComponent(providerConfigKey)}`,
  )) as { credentials?: Record<string, unknown>; connection_config?: Record<string, unknown> };
  return { credentials: data.credentials ?? {}, connection_config: data.connection_config ?? {} };
}
