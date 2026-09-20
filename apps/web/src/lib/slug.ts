// Slug rules: letters, digits and underscore only. Everything else collapses
// to a single underscore; leading/trailing underscores are trimmed.
export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "item";
}
