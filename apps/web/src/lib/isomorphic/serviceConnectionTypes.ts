import { z } from "zod";

// Service connection types. Each type has one schema for its whole config;
// fields listed in `secretFields` are stored encrypted (ServiceConnection.secrets),
// the rest in plain `config`. Both types are OAuth: the user picks what to
// grant, we run the consent flow and keep the tokens.

// ---------- Google ----------

export const GOOGLE_ACCESS_LEVELS = ["none", "readonly", "readwrite"] as const;
export type GoogleAccess = (typeof GOOGLE_ACCESS_LEVELS)[number];

// The Google services a connection can grant, with the scope for each level
// and the level a new connection starts with.
export const GOOGLE_SERVICES = [
  {
    key: "drive",
    label: "Google Drive",
    defaultAccess: "readonly",
    scopes: {
      readonly: "https://www.googleapis.com/auth/drive.readonly",
      readwrite: "https://www.googleapis.com/auth/drive",
    },
  },
  {
    key: "gmail",
    label: "Gmail",
    defaultAccess: "none",
    scopes: {
      readonly: "https://www.googleapis.com/auth/gmail.readonly",
      // Read, send, label and trash mail. No permanent delete (that needs https://mail.google.com/).
      readwrite: "https://www.googleapis.com/auth/gmail.modify",
    },
  },
] as const;
export type GoogleServiceKey = (typeof GOOGLE_SERVICES)[number]["key"];

const googleAccess = z.enum(GOOGLE_ACCESS_LEVELS);
const googleScopeMap = z.record(z.string(), googleAccess);

const googleSchema = z.object({
  // What the user asked for, per service.
  scopes: googleScopeMap.default({}),
  // What the last consent granted. Differs from `scopes` until reconnect.
  granted: googleScopeMap.optional(),
  email: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
});
export type GoogleServicesConfig = z.infer<typeof googleSchema>;

// ---------- QuickBooks ----------

export const QUICKBOOKS_PRODUCTS = [
  { key: "accounting", label: "Accounting", scope: "com.intuit.quickbooks.accounting" },
  { key: "payments", label: "Payments", scope: "com.intuit.quickbooks.payment" },
] as const;

const qbProducts = z.record(z.string(), z.boolean());

const quickbooksSchema = z.object({
  products: qbProducts.default({}),
  granted: qbProducts.optional(),
  realmId: z.string().optional(),
  environment: z.enum(["sandbox", "production"]).optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  refreshTokenExpiresAt: z.number().optional(),
});
export type QuickbooksConfig = z.infer<typeof quickbooksSchema>;

// ---------- registry ----------

const TOKEN_FIELDS = ["accessToken", "refreshToken", "expiresAt", "refreshTokenExpiresAt"];

export type ServiceTypeDef = {
  type: string;
  label: string;
  description: string;
  schema: z.ZodType<Record<string, unknown>>;
  secretFields: string[];
};

export const SERVICE_TYPES = {
  "google-services": {
    type: "google-services",
    label: "Google",
    description: "A Google account. Pick the access each service gets; agents get an OAuth token with those scopes.",
    schema: googleSchema,
    secretFields: TOKEN_FIELDS,
  },
  quickbooks: {
    type: "quickbooks",
    label: "QuickBooks",
    description: "One QuickBooks company. Agents get an OAuth token and the realmId to call the QuickBooks API.",
    schema: quickbooksSchema,
    secretFields: TOKEN_FIELDS,
  },
} satisfies Record<string, ServiceTypeDef>;

export type ServiceType = keyof typeof SERVICE_TYPES;
export const SERVICE_TYPE_LIST: ServiceTypeDef[] = Object.values(SERVICE_TYPES);

export function serviceTypeDef(type: string): ServiceTypeDef | null {
  return (SERVICE_TYPES as Record<string, ServiceTypeDef>)[type] ?? null;
}

// ---------- selection helpers (shared by UI and server) ----------

// The access the user asked for: Google scope map or QuickBooks products.
export type Selection = Record<string, string | boolean>;

export function requestedSelection(type: string, config: Record<string, unknown>): Selection {
  return ((type === "quickbooks" ? config.products : config.scopes) ?? {}) as Selection;
}

function normalize(type: string, sel: Selection | undefined): Selection {
  const out: Selection = {};
  if (type === "quickbooks") {
    for (const p of QUICKBOOKS_PRODUCTS) out[p.key] = !!sel?.[p.key];
  } else {
    for (const s of GOOGLE_SERVICES) out[s.key] = (sel?.[s.key] as GoogleAccess | undefined) ?? "none";
  }
  return out;
}

export function sameSelection(type: string, a: Selection | undefined, b: Selection | undefined): boolean {
  const na = normalize(type, a);
  const nb = normalize(type, b);
  return Object.keys(na).every((k) => na[k] === nb[k]);
}

export function selectionIsEmpty(type: string, sel: Selection | undefined): boolean {
  return Object.values(normalize(type, sel)).every((v) => v === false || v === "none");
}

// OAuth scopes to request for a selection.
export function scopesFor(type: string, sel: Selection | undefined): string[] {
  const n = normalize(type, sel);
  if (type === "quickbooks") return QUICKBOOKS_PRODUCTS.filter((p) => n[p.key]).map((p) => p.scope);
  const scopes = ["openid", "email"];
  for (const s of GOOGLE_SERVICES) {
    const level = n[s.key] as GoogleAccess;
    if (level !== "none") scopes.push(s.scopes[level]);
  }
  return scopes;
}

// Short human summary, e.g. "Drive (read-only)" or "Accounting, Payments".
export function selectionLabel(type: string, sel: Selection | undefined): string {
  const n = normalize(type, sel);
  const parts =
    type === "quickbooks"
      ? QUICKBOOKS_PRODUCTS.filter((p) => n[p.key]).map((p) => p.label)
      : GOOGLE_SERVICES.filter((s) => n[s.key] !== "none").map(
          (s) => `${s.label.replace(/^Google /, "")} (${n[s.key] === "readonly" ? "read-only" : "read-write"})`,
        );
  return parts.join(", ") || "nothing";
}

export type ServiceConnectionState = "NOT_CONNECTED" | "CONNECTED" | "NEEDS_RECONNECT";

// `granted` is written only by a successful OAuth callback.
export function connectionState(type: string, config: Record<string, unknown>): ServiceConnectionState {
  if (!config.granted) return "NOT_CONNECTED";
  return sameSelection(type, requestedSelection(type, config), config.granted as Selection | undefined)
    ? "CONNECTED"
    : "NEEDS_RECONNECT";
}
