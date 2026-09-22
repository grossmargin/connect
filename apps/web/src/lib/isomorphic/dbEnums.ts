// String unions that replace what used to be Postgres/Prisma enums. The DB
// columns are plain `text`; these const arrays are the allowed values and the
// derived types are what app code uses in place of the generated enum types.
// Keep each list in sync with the matching column comment in schema.prisma.
//
// (McpAuthType lives in lib/mcpCredentials.ts, next to its credential schemas.)

export const CREDENTIAL_TYPES = ["SINGLELINE", "MULTILINE", "NANGO"] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const MCP_CONNECTION_STATUSES = ["PENDING", "REGISTERED", "CONNECTED", "ERROR"] as const;
export type McpConnectionStatus = (typeof MCP_CONNECTION_STATUSES)[number];

export const ACTOR_TYPES = ["USER", "SERVICE_ACCOUNT"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const AUDIT_SOURCES = ["UI", "MCP"] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export const AUDIT_ACTIONS = [
  "VIEW_CREDENTIAL",
  "CREATE_CREDENTIAL",
  "UPDATE_CREDENTIAL",
  "DELETE_CREDENTIAL",
  "VIEW_CONNECTION_SECRETS",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
