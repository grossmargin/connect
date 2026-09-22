// KV namespace + TTL for the transient OAuth authorization state (holds the
// PKCE verifier and connection id, keyed by an unguessable state token).
export const OAUTH_STATE_NS = "mcp_oauth_state";
export const OAUTH_STATE_TTL_SECONDS = 600;
