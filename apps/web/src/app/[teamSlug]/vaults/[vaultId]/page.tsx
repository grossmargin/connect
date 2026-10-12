import { redirect } from "next/navigation";

// Vaults are gone from the UI; old links land on the credentials list.
export default async function VaultPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  redirect(`/${teamSlug}`);
}
