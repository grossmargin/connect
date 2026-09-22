export type TenantSummary = { id: string; name: string };
export type GroupSummary = { name: string; slug: string; tenants: TenantSummary[] };
export type ConnSummary = { name: string; slug: string };
export type VaultSummary = { name: string; description?: string | null };
export type WrapperSummary = { name: string; slug: string; type: string };

function wrappersSection(wrappers: WrapperSummary[]): string {
  if (!wrappers.length) return "";
  const list = wrappers
    .map((w) => `- **${w.slug}** — ${w.name} (${w.type}); tools are prefixed \`${w.slug}__\``)
    .join("\n");
  return `

## Composed MCPs

Some services are wrapped directly as MCP tools (a "composed MCP"). Their tools are prefixed with the wrapper's id and served here alongside everything else:

${list}`;
}

function vaultsList(vaults: VaultSummary[]): string {
  if (!vaults.length) return "_No credential vaults are available to you yet._";
  return vaults
    .map((v) => `- **${v.name}**${v.description ? ` — ${v.description}` : ""}`)
    .join("\n");
}

function connSection(c: ConnSummary): string {
  return `## ${c.slug} — ${c.name}

Its tools are prefixed with \`${c.slug}__\` and call the service directly (no tenant argument). Call \`${c.slug}__instructions\` for service-specific guidance.`;
}

function groupSection(g: GroupSummary): string {
  const tenants = g.tenants.length
    ? g.tenants.map((t) => `- \`${t.id}\` — ${t.name}`).join("\n")
    : "_No tenants configured yet._";

  return `## ${g.slug} — ${g.name} (group)

All tools in this group are prefixed with \`${g.slug}__\` and back onto ${g.tenants.length} tenant(s). **Every \`${g.slug}__\` call must name a tenant** — the same tool routes to a different account per tenant.

**Pass a \`tenant\` argument on every \`${g.slug}__\` call**, e.g. \`{ "tenant": "${g.tenants[0]?.id ?? "<tenant-id>"}", ... }\`. It is a required argument. If you omit it, the call fails and lists the tenant ids.

**Steps:** call \`${g.slug}__tenants\` to get the tenant ids → pick one → pass it as \`tenant\` on each tool call. Optionally call \`${g.slug}__instructions\` with that tenant for tenant-specific guidance.

Tenants:

${tenants}`;
}

// Instructions markdown for one Published MCP. Its members (individual
// connections and tenanted groups) are templated in.
export function renderRootInstructions(
  groups: GroupSummary[],
  connections: ConnSummary[] = [],
  vaults: VaultSummary[] = [],
  wrappers: WrapperSummary[] = [],
): string {
  const members = [...connections.map(connSection), ...groups.map(groupSection)];
  const sections = members.length
    ? ["\nThe MCPs available to you:\n", ...members].join("\n\n")
    : "\n_No MCPs are published here yet._";

  return `# Grossmargin Connect

Grossmargin Connect gives you (the agent) access to external services. There are two ways to reach a service: credentials and MCP tools.

## Credentials (API keys and similar)

Call \`get_credentials\` to list the available credentials, then \`view_credential\` to read one. A credential can have different shapes — a single key or several — so use \`view_credential\` to see it. What you get back is ready to use as-is: nothing else is required, no refresh. Credentials are well scoped and safe to use to access the service.

Credentials are grouped into the following vaults, which give you an idea of what services you can access:

${vaultsList(vaults)}

## Priority

You may have several ways to reach the same service. Prefer them in this order:

1. MCP tools of **this** server
2. Credentials from **this** server
3. MCP tools of other servers

## MCP tools

Each published MCP contributes tools under its own \`<id>__\` prefix. An individual MCP is called directly; a **group** bundles several accounts (tenants) behind one prefix and needs a \`tenant\` argument to pick the account.

**IMPORTANT:** If a service offers both tools and an API key, try the tools first and fall back to the API key.
${sections}${wrappersSection(wrappers)}
`;
}
