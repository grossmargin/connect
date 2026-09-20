import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginCard } from "./LoginCard";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const session = await auth();
  if (session?.user?.id && !callbackUrl) redirect("/");

  return <LoginCard callbackUrl={callbackUrl} />;
}
