// Catalog of third-party MCP servers we've vetted, plus everything we learned
// probing their OAuth / Dynamic Client Registration (DCR, RFC 7591) behaviour.
//
// This is a reference table, not runtime config: the connect flow still
// discovers each server's OAuth metadata live (see lib/mcpClient.ts). We keep
// the findings here so we don't have to re-derive, by hand, which servers we
// can actually self-register against and what redirect_uri each one will
// accept. Scope lists are intentionally omitted — they're long and are fetched
// at runtime from the protected-resource metadata.
//
// All `probedAt` facts below were verified by live requests on 2026-09-19.

/** OAuth Dynamic Client Registration (RFC 7591) posture of a server. */
export type DcrSupport =
  // Anyone can self-register a client with no gate. This is what our connect
  // flow needs, since we register `${APP_URL}/callback` on the fly.
  | "open"
  // A registration_endpoint exists but restricts who/what may register
  // (e.g. an allowlist of redirect hosts, or an initial-access-token). Our
  // default DCR flow will be rejected unless it satisfies the gate.
  | "gated"
  // The server advertises OAuth (401 + WWW-Authenticate / protected-resource
  // metadata) but its discovery and/or registration endpoints are unreachable
  // from a non-interactive/server-side client, so DCR can't be performed.
  | "blocked"
  // No registration_endpoint advertised at all.
  | "none";

/**
 * Which redirect_uris a server's DCR endpoint will accept. A server may allow
 * several of these at once; the flags are independent.
 */
export type RedirectPolicy = {
  /** `https://` redirect on ANY host is accepted (any path, any port). */
  anyHttpsHost: boolean;
  /** `http://` on a loopback host (localhost / 127.0.0.1, any port/path). */
  loopbackHttp: boolean;
  /** `http://` on a public (non-loopback) host — almost always refused. */
  publicHttp: boolean;
  /** Non-http(s) custom URI schemes (e.g. `vscode://`, `claude://`). */
  customScheme: boolean;
  /**
   * When set, `https` redirects are restricted to these registrable domains
   * (suffix match — subdomains included, so `sub.claude.ai` is covered by
   * `claude.ai`). `anyHttpsHost` is false whenever this is present.
   */
  allowedHttpsHosts?: string[];
  /** Anything the flags above don't capture. */
  note?: string;
};

/**
 * How to authenticate to a server with a static token in an HTTP header — i.e.
 * our HEADERS auth mode, used instead of (or alongside) OAuth/DCR. Present on a
 * server when it accepts a bring-your-own token; absent when the only supported
 * path is OAuth/DCR.
 */
export type TokenAuth = {
  /** Scheme prefixing the header value, e.g. "Bearer". Empty string = raw value. */
  scheme: string;
  /** Header the token goes in. Defaults to "Authorization". */
  header?: string;
  /** What the user creates/obtains, when known (e.g. "Personal Access Token"). */
  kind?: string;
  /** Docs/dashboard URL where the token is created. */
  tokenUrl?: string;
  /** True when we've confirmed the hosted MCP actually accepts this token. */
  verified?: boolean;
};

export type KnownMcpServer = {
  name: string;
  /** The MCP endpoint URL users connect to. */
  url: string;
  /** Set when the server accepts a static token via the HEADERS auth mode. */
  tokenAuth?: TokenAuth;
  /**
   * OAuth authorization server the MCP SDK resolves to, from the server's
   * protected-resource metadata (its first `authorization_servers` entry).
   */
  authorizationServer?: string;
  /** RFC 7591 registration endpoint, when one is advertised and usable. */
  registrationEndpoint?: string;
  dcr: DcrSupport;
  /** How the registration endpoint validates redirect_uris. Omitted when unknown. */
  redirect?: RedirectPolicy;
  /**
   * Whether we can connect from Grossmargin Connect (redirect host
   * `connect.grossmargin.io`, plus `localhost` in dev) via our standard DCR
   * flow. False means DCR is gated/blocked against our redirect.
   */
  selfServeConnect: boolean;
  /**
   * True once we've completed the full DCR → authorize → token flow against
   * this server (i.e. a CONNECTED McpConnection row exists).
   */
  verifiedConnected?: boolean;
  /** ISO date the facts on this entry were last probed. */
  probedAt: string;
  /** Free-form findings and caveats worth carrying in code. */
  notes?: string;
};

// Redirect policy shared by the "well-behaved" OAuth 2.1 servers below:
// any https redirect (any host/path/port) OR http on loopback; public http is
// refused. This is the standard MCP OAuth behaviour, so `connect.grossmargin.io`
// and `localhost` dev both work.
const STANDARD_REDIRECT: RedirectPolicy = {
  anyHttpsHost: true,
  loopbackHttp: true,
  publicHttp: false,
  customScheme: false, // not probed on these servers; assume unsupported
};

export const KNOWN_MCP_SERVERS: KnownMcpServer[] = [
  {
    name: "Brex",
    url: "https://api.brex.com/mcp",
    // Brex's protected-resource metadata lists TWO auth servers. The MCP SDK
    // resolves the first (api.brex.com), which offers open DCR. Do NOT fall
    // through to the second (accounts-api.brex.com/oauth2/default — an Okta
    // tenant): its /oauth2/v1/clients endpoint rejects open DCR with
    // 403 "Invalid session" (Okta requires an initial access token).
    authorizationServer: "https://api.brex.com",
    registrationEndpoint: "https://api.brex.com/v3/clients",
    dcr: "open",
    redirect: STANDARD_REDIRECT,
    selfServeConnect: true,
    probedAt: "2026-09-19",
    notes:
      "Open DCR via api.brex.com/v3/clients (201 for our https/localhost redirects). " +
      "The alternate Okta auth server (accounts-api.brex.com/oauth2/default) is gated — avoid it.",
  },
  {
    name: "Deel",
    url: "https://api.letsdeel.com/mcp",
    authorizationServer: "https://api.letsdeel.com",
    registrationEndpoint: "https://api.letsdeel.com/oauth/register",
    // Registration endpoint works, but it only accepts redirect_uris that are
    // either a custom URI scheme, OR https on a hard-coded allowlist of
    // first-party AI-client domains. Our redirect host is not on it, so our
    // standard DCR flow fails ("The redirect_uri host is not allowed by this
    // server"). This allowlist is undocumented — reverse-engineered by probing.
    dcr: "gated",
    // Deel's documented fallback for non-allowlisted clients: a Personal Access
    // Token as a bearer. This is the practical way to connect Deel here.
    tokenAuth: {
      scheme: "Bearer",
      kind: "Personal Access Token (or Organization token)",
      tokenUrl: "https://developer.deel.com/docs/api-tokens-1",
      verified: false, // mechanism confirmed; not run with a real token
    },
    redirect: {
      anyHttpsHost: false,
      loopbackHttp: false, // localhost host is not on the allowlist
      publicHttp: false,
      customScheme: true, // any custom (non-http) scheme accepted, not an allowlist
      allowedHttpsHosts: ["claude.ai", "cursor.com", "chatgpt.com"],
      note:
        "https allowed only for these registrable domains (suffix match, subdomains ok); " +
        "path is not checked; http refused even on allowlisted hosts.",
    },
    selfServeConnect: false,
    probedAt: "2026-09-19",
    notes:
      "Host allowlist is undocumented. Deel docs (developer.deel.com/mcp/connecting-clients) " +
      "list Cursor/VS Code/Claude Desktop/ChatGPT and steer everyone else to a Personal " +
      "Access Token (Authorization: Bearer <PAT>) instead of OAuth. To self-serve connect " +
      "from connect.grossmargin.io we'd need Deel to allowlist our host, or a PAT/bearer auth " +
      "mode (DCR alone can't work here). Claude.ai/Desktop connectors DO work (claude.ai is " +
      "allowlisted); Claude Code CLI does not (its loopback redirect is refused).",
  },
  {
    name: "Gusto",
    url: "https://mcp.api.gusto.com/anthropic",
    authorizationServer: "https://mcp.api.gusto.com",
    registrationEndpoint: "https://mcp.api.gusto.com/oauth/register",
    dcr: "open",
    redirect: STANDARD_REDIRECT,
    selfServeConnect: true,
    verifiedConnected: true, // CONNECTED row exists
    probedAt: "2026-09-19",
  },
  {
    name: "Mercury",
    url: "https://mcp.mercury.com/mcp",
    authorizationServer: "https://mcp.mercury.com/",
    registrationEndpoint: "https://mcp.mercury.com/register",
    dcr: "open",
    redirect: STANDARD_REDIRECT,
    selfServeConnect: true,
    verifiedConnected: true, // CONNECTED row exists
    probedAt: "2026-09-19",
    notes:
      "Its protected-resource well-known lives at /.well-known/oauth-protected-resource " +
      "(no /mcp suffix); the 401 WWW-Authenticate does not point to it. Rejects public http " +
      'with "http: is only allowed for loopback hosts".',
  },
  {
    name: "Notion",
    url: "https://mcp.notion.com/mcp",
    authorizationServer: "https://mcp.notion.com",
    registrationEndpoint: "https://mcp.notion.com/register",
    dcr: "open",
    redirect: STANDARD_REDIRECT,
    selfServeConnect: true,
    probedAt: "2026-09-19",
  },
  {
    name: "Ramp",
    url: "https://mcp.ramp.com/mcp",
    authorizationServer: "https://mcp.ramp.com",
    registrationEndpoint: "https://mcp.ramp.com/register",
    dcr: "open",
    // Most permissive of the set: accepts even plain http on a public host.
    redirect: {
      anyHttpsHost: true,
      loopbackHttp: true,
      publicHttp: true,
      customScheme: false, // not separately probed
    },
    selfServeConnect: true,
    verifiedConnected: true, // CONNECTED rows exist
    probedAt: "2026-09-19",
    notes: "Most permissive redirect validation observed — accepts any https, loopback http, and public http.",
  },
  {
    name: "Rippling",
    url: "https://mcp.rippling.com/mcp",
    // Advertises MCP OAuth: POST /mcp returns 401 with
    // WWW-Authenticate: Bearer realm="OAuth", resource_metadata=
    //   https://mcp.rippling.com/.well-known/oauth-protected-resource/mcp
    // But a Cloudflare WAF returns 403 (HTML challenge) on /.well-known/* and
    // /register for every non-interactive client (curl, WebFetch, headless
    // browser) — only /mcp itself passes. Since our connect flow does discovery
    // + DCR server-side, it will hit the same 403 and fail at discovery.
    dcr: "blocked",
    // DCR is WAF-blocked, but POST /mcp is reachable and takes a bearer, so the
    // HEADERS mode can connect it with a bring-your-own token. Rippling admin
    // API tokens are created in the admin console (Settings › API Tokens; needs
    // an admin permission profile; scoped to creator, ~30-day expiry). NOTE: the
    // hosted mcp.rippling.com advertises OAuth (realm="OAuth"); we have NOT
    // verified it accepts an admin API token as the bearer — try it, or capture
    // an OAuth access token from an interactive browser connector.
    tokenAuth: {
      scheme: "Bearer",
      kind: "Admin API token (Rippling admin console › Settings › API Tokens), or an OAuth access token",
      tokenUrl: "https://developer.rippling.com",
      verified: false, // unconfirmed against the hosted MCP
    },
    selfServeConnect: false,
    probedAt: "2026-09-19",
    notes:
      "Could not verify DCR — Cloudflare WAF blocks the OAuth discovery/registration paths " +
      "server-side (403). Only /.well-known/* and /register are blocked; POST /mcp is reachable " +
      "and returns 401 (needs a bearer). So the HEADERS auth mode CAN connect it: point at " +
      "https://mcp.rippling.com/mcp with `Authorization: Bearer <token>` — tool calls skip " +
      "discovery. You must obtain the token out-of-band (interactive OAuth in a real browser " +
      "via a Claude/Cursor connector, or a Rippling-issued API token). Caveat: a short-lived " +
      "OAuth access token in a static header will expire — prefer a durable API token. " +
      "Alternatively, get an allowlisted deployment IP or ask Rippling to exempt those paths " +
      "so normal DCR works. No CONNECTED row exists.",
  },
];

/** Look up a known server by its MCP endpoint URL. */
export function findKnownMcpServer(url: string): KnownMcpServer | undefined {
  return KNOWN_MCP_SERVERS.find((s) => s.url === url);
}
