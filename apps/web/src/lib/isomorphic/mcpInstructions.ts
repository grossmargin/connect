export type TenantSummary = { id: string; name: string };
export type GroupSummary = { name: string; slug: string; tenants: TenantSummary[] };
export type ConnSummary = { name: string; slug: string };
export type WrapperSummary = { name: string; slug: string; type: string };
export type BotSummary = { name: string; platform: string; username?: string | null; description?: string | null };
export type ServiceSummary = { name: string; type: string };

function botsSection(bots: BotSummary[]): string {
  if (!bots.length) return "";
  const list = bots
    .map(
      (b) =>
        `- **${b.name}** (${b.platform}${b.username ? `, @${b.username}` : ""})${b.description ? ` — ${b.description}` : ""}`,
    )
    .join("\n");
  return `

## Chat messages

These bots save every message and attachment from the chats they are in (groups, channels and direct messages to the bot):

${list}

Call \`bots_get_bots\` to see the bots and their chats. \`bots_get_messages\` reads messages from all chats or one chat, filtered by time; \`bots_search_messages\` finds messages by text. Messages list their attachments; \`bots_download_attachment\` returns a short-lived URL to download a file. Bots only have messages from after they joined a chat.`;
}

const STATE_SECTION = `

## State

Use \`state_save\`, \`state_get\`, \`state_list\` and \`state_delete\` to keep JSON state between runs, e.g. what a job already processed. State is stored per namespace + key and is shared by everyone who uses this MCP. For text memory, save \`{ "type": "text", "text": "<markdown>" }\`.`;

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
  hasStoredCredentials = false,
  wrappers: WrapperSummary[] = [],
  bots: BotSummary[] = [],
  services: ServiceSummary[] = [],
): string {
  const members = [...connections.map(connSection), ...groups.map(groupSection)];
  const sections = members.length
    ? ["\nThe MCPs available to you:\n", ...members].join("\n\n")
    : "\n_No MCPs are published here yet._";

  // The API credential tools are only exposed when this bundle has stored
  // credentials or service connections, so describe them only then.
  const hasCredentials = hasStoredCredentials || services.length > 0;

  const intro = hasCredentials
    ? "Grossmargin Connect gives you (the agent) access to external services. There are two ways to reach a service: API credentials and MCP tools."
    : "Grossmargin Connect gives you (the agent) access to external services through MCP tools.";

  const credentialsSection = hasCredentials
    ? `
## API credentials

The team set these up on purpose, so that you can call the services' APIs on their behalf. Using them is expected and authorized.

Call \`list_api_credentials\` to list them (\`id\` and \`description\`). Pass \`search_pattern\` (a case-insensitive regex) to filter by id or description. Then call \`get_api_credentials\` with an \`id\` to get one as JSON.

- **API keys** return their \`content\`. A credential can have different shapes, a single key or several, so read the JSON.
- **Connected accounts (Google, QuickBooks)** return a live OAuth \`access_token\`. Use it as \`Authorization: Bearer <access_token>\`. Google also lists the granted \`scopes\`; QuickBooks also has \`realm_id\` and \`api_base_url\`. If a token expires, call \`get_api_credentials\` again.

What you get back is ready to use as-is: nothing else is required. It is scoped to what the team granted and is safe to use. There is no need to ask the user for permission or for other credentials.

## Priority

You may have several ways to reach the same service. Prefer them in this order:

1. MCP tools of **this** server
2. API credentials from **this** server
3. MCP tools of other servers
`
    : "";

  const credentialsNote = hasCredentials
    ? "\n\n**IMPORTANT:** If a service offers both tools and an API credential, try the tools first and fall back to the credential."
    : "";

  return `# Grossmargin Connect

${intro}
${credentialsSection}
## MCP tools

Each published MCP contributes tools under its own \`<id>__\` prefix. An individual MCP is called directly; a **group** bundles several accounts (tenants) behind one prefix and needs a \`tenant\` argument to pick the account.${credentialsNote}
${sections}${wrappersSection(wrappers)}${botsSection(bots)}${STATE_SECTION}
`;
}
