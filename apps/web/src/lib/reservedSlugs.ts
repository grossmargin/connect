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
