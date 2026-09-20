export type TenantSummary = { id: string; name: string };
export type ToolsetSummary = { name: string; slug: string; tenants: TenantSummary[] };
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

function toolsetSection(ts: ToolsetSummary): string {
  const tenants = ts.tenants.length
    ? ts.tenants.map((t) => `- \`${t.id}\` — ${t.name}`).join("\n")
    : "_No tenants configured yet._";

  return `## ${ts.slug} — ${ts.name}

All tools in this toolset are prefixed with \`${ts.slug}__\` and back onto ${ts.tenants.length} tenant(s) in the ${ts.name} domain. **Every \`${ts.slug}__\` call must name a tenant** — the same tool routes to a different account per tenant.

**Pass a \`tenant\` argument on every \`${ts.slug}__\` call**, e.g. \`{ "tenant": "${ts.tenants[0]?.id ?? "<tenant-id>"}", ... }\`. It is a required argument. If you omit it, the call fails and lists the tenant ids.

**Steps:** call \`${ts.slug}__tenants\` to get the tenant ids → pick one → pass it as \`tenant\` on each tool call. Optionally call \`${ts.slug}__instructions\` with that tenant for tenant-specific guidance.

Tenants:

${tenants}`;
}

// Instructions markdown for the root MCP server. The toolset list is templated
// in from the caller's teams.
export function renderRootInstructions(
  toolsets: ToolsetSummary[],
  vaults: VaultSummary[] = [],
  wrappers: WrapperSummary[] = [],
): string {
  const sections = toolsets.length
    ? ["\nThe toolsets available to you:\n", ...toolsets.map(toolsetSection)].join("\n\n")
    : "\n_No toolsets are available to you yet._";

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

Some services are exposed as a set of MCP tools grouped into a **toolset**. Each toolset covers one domain and gives access to several tenants within it.

**IMPORTANT:** If a service offers both a toolset and an API key, try the tools first and fall back to the API key.
${sections}${wrappersSection(wrappers)}
`;
}
