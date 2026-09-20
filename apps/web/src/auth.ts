import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// Restrict sign-in to one Google Workspace domain. Unset = any Google account.
const ALLOWED_DOMAIN = process.env.AUTH_ALLOWED_DOMAIN?.trim() || undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Google({
      authorization: {
        // `hd` only hints Google's account chooser; sign-in is enforced below.
        params: { prompt: "select_account", ...(ALLOWED_DOMAIN ? { hd: ALLOWED_DOMAIN } : {}) },
      },
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email;
      if (!email) return false;
      return !ALLOWED_DOMAIN || email.endsWith(`@${ALLOWED_DOMAIN}`);
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
