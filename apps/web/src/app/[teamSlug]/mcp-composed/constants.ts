// Composed MCP types the UI can create. Mirrors the types buildComposedMcp
// understands in lib/wrapperTools.ts. Only QuickBooks today.
export const COMPOSED_MCP_TYPES = [{ value: "quickbooks", label: "QuickBooks" }] as const;

export type ComposedMcpType = (typeof COMPOSED_MCP_TYPES)[number]["value"];

export function typeLabel(type: string): string {
  return COMPOSED_MCP_TYPES.find((t) => t.value === type)?.label ?? type;
}
