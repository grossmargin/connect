# Grossmargin Connect

Team secrets vault and MCP gateway: stores credentials, connects to third-party MCP servers, and serves
its own MCP endpoint. Next.js + Prisma + Postgres.

## Model

- **Team** — owns everything. Team↔User is many-to-many. Any member has full read+write on all the
  team's vaults.
- **Vault** — a group of credentials in a team.
- **Credential** — `name`, `description`, `type` (`SINGLELINE` | `MULTILINE` | `NANGO`), and `content`.
  Content is encrypted at rest (AES-256-GCM) and decrypts to JSON `{ "value": "..." }`.
  Name/description/type stay in plaintext.
  - **NANGO** credentials store no secret. `content` is null; a `credentialRef` JSONB
    (`{ connectionId, providerConfigKey }`) points at a [Nango](https://nango.dev) connection. On reveal,
    the server fetches a live, auto-refreshed OAuth access token from Nango. To an MCP client this is
    transparent: the credential lists like any other, and `view_credential` returns the current token in
    `content` (plus `realmId` and `expiresAt` for QuickBooks). Needs `NANGO_SECRET_KEY` in the
    environment; `NANGO_HOST` overrides the default `https://api.nango.dev`.
- **ServiceAccount** — team-scoped, read-only. Holds one or more keys (`sa_...`). Keys are shown once at
  creation, then only as a prefix. Any key works (rotation).

## Access

Users sign in with Google. Set `AUTH_ALLOWED_DOMAIN` to restrict sign-in to one Workspace domain; leave
it unset to allow any Google account. A first login creates a `User` with no team.
Add people to teams by editing the database — there are no invitations yet.

## Encryption

`ENCRYPTION_KEY` is a comma-separated list of 32-byte base64 keys, newest first. New content is encrypted
with the first key; each record tags which key it used, so old keys still decrypt after rotation.

```
openssl rand -base64 32   # make a key
```

## MCP

The MCP server is mounted at `/mcp` (stateless Streamable HTTP). Tools:

- `get_vaults` — vaults you can access.
- `get_credentials(vaultId?)` — credential metadata (never content).
- `view_credential(credentialId)` — decrypted content, or a live Nango token for `NANGO` creds. Audited.

Two auth paths:

- **Service account** — `Authorization: Bearer sa_...`. Scoped to the SA's team, read-only.
- **OAuth** — standard MCP flow (Dynamic Client Registration + PKCE). The human logs in with Google; the
  token is scoped to all their teams. Endpoints: `/.well-known/oauth-authorization-server`,
  `/oauth/register`, `/oauth/authorize`, `/oauth/token`.

## Audit

Every content reveal (`view_credential`, UI or MCP) and credential create/update is written to `AuditLog`.

## Develop

```
bun install
cp apps/web/.env.example apps/web/.env   # fill in values
docker compose up -d db
bun run db:push
bun run dev
```

## Deploy

```
docker compose up --build
bun run db:migrate   # or db:push, against the compose Postgres
```
