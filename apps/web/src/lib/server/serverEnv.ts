import "server-only";
import { z } from "zod";

// Single, validated view of server environment variables. Parsed once at import.
// A missing required var fails fast at boot instead of surfacing as a vague
// runtime error later.
//
// Note: crypto.ts reads process.env.ENCRYPTION_KEY directly (its key-rotation
// tests mutate the env at runtime), so it does not go through here — but the var
// is still declared so a missing key is caught early.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_DIRECT_URL: z.string().min(1).optional(),
  ENCRYPTION_KEY: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  APP_URL: z.string().min(1).optional(),
  AUTH_URL: z.string().min(1).optional(),
  AUTH_TRUST_HOST: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_ALLOWED_DOMAINS: z.string().optional(),
  NANGO_SECRET_KEY: z.string().optional(),
  NANGO_HOST: z.string().optional(),
  NANGO_NOTION_CONNECTION_ID: z.string().optional(),
  NANGO_NOTION_PROVIDER_CONFIG_KEY: z.string().optional(),
  // Vercel sends it as a bearer to cron routes.
  CRON_SECRET: z.string().min(1).optional(),
  CLAUDE_OTLP_INTAKE_KEYS: z.string().optional(),
  CLAUDE_OTLP_INTAKE_SALT: z.string().optional(),
  __UNSAFE_PERMANENT_LOGIN: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const serverEnv = schema.parse(process.env);
export type ServerEnv = z.infer<typeof schema>;

// The app's public base URL, trailing slash stripped. Falls back to local dev.
export function appUrl(): string {
  return (serverEnv.APP_URL ?? "http://localhost:3069").replace(/\/$/, "");
}

// Origin the caller used, from proxy headers; https unless on localhost. Falls
// back to APP_URL. Use for URLs handed to outside services, which must not hit
// a redirect.
export function requestOrigin(get: (name: string) => string | null | undefined): string {
  const host = get("x-forwarded-host") ?? get("host");
  if (!host) return appUrl();
  const proto = get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
