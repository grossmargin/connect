// Top-level route segments a team slug must not collide with (a slug becomes a
// bare `/<slug>` path). Kept dependency-free so the edge middleware can import
// it. Child segments like `settings` or `vaults` live under `/<slug>/…` and are
// not reserved.
export const RESERVED_SLUGS = new Set([
  "api",
  "oauth",
  "otlp",
  "toolset",
  "mcp",
  "login",
  "no-team",
  "account",
  "invite",
  "callback",
  "quickbooks-disconnect",
  "_next",
  "favicon.ico",
  "icon.svg",
  "robots.txt",
  "sitemap.xml",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug) || slug.startsWith(".well-known");
}

// Second-segment names under /[teamSlug] that are UI pages, so a published-scope
// slug must not collide with them (a scope is served at /[teamSlug]/[slug]).
export const TEAM_SUBROUTES = new Set([
  "vaults",
  "mcp-connections",
  "published",
  "settings",
  "mcp",
  "otlp",
]);

export function isTeamSubroute(slug: string): boolean {
  return TEAM_SUBROUTES.has(slug);
}
