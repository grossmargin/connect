import { z } from "zod";

// Service connection types. Each type has one schema for all its fields; fields
// marked `secret` are stored encrypted (ServiceConnection.secrets), the rest in
// plain `config`. The UI renders the create/edit form from `fields`.

export type ServiceField = {
  name: string;
  label: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  extra?: string;
  defaultValue?: string;
};

export type ServiceTypeDef = {
  type: string;
  label: string;
  description: string;
  fields: ServiceField[];
  schema: z.ZodType<Record<string, unknown>>;
};

export const NANGO_DEFAULT_HOST = "https://api.nango.dev";

const nangoSchema = z.object({
  host: z
    .string()
    .trim()
    .default(NANGO_DEFAULT_HOST)
    .transform((s) => (s || NANGO_DEFAULT_HOST).replace(/\/+$/, ""))
    .pipe(z.url({ message: "Host must be a URL" })),
  secretKey: z.string().trim().min(1, "Secret key is required"),
});
export type NangoServiceConfig = z.infer<typeof nangoSchema>;

export const SERVICE_TYPES = {
  nango: {
    type: "nango",
    label: "Nango",
    description: "One Nango environment. Agents list its connections and pull their credentials.",
    fields: [
      {
        name: "host",
        label: "Host",
        placeholder: NANGO_DEFAULT_HOST,
        defaultValue: NANGO_DEFAULT_HOST,
        extra: "Nango API URL. Change it only for self-hosted Nango.",
      },
      {
        name: "secretKey",
        label: "Secret key",
        secret: true,
        required: true,
        extra: "Environment Settings → Secret Key in the Nango dashboard.",
      },
    ],
    schema: nangoSchema,
  },
} satisfies Record<string, ServiceTypeDef>;

export type ServiceType = keyof typeof SERVICE_TYPES;
export const SERVICE_TYPE_LIST: ServiceTypeDef[] = Object.values(SERVICE_TYPES);

export function serviceTypeDef(type: string): ServiceTypeDef | null {
  return (SERVICE_TYPES as Record<string, ServiceTypeDef>)[type] ?? null;
}

export function secretFieldNames(def: ServiceTypeDef): string[] {
  return def.fields.filter((f) => f.secret).map((f) => f.name);
}
