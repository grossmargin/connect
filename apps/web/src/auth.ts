import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/server/db";

// Restrict sign-in to these Google Workspace domains (comma-separated). Empty =
// any Google account.
const ALLOWED_DOMAINS = (process.env.AUTH_ALLOWED_DOMAINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const {
  handlers,
  auth: nextAuth,
  signIn,
  signOut,
} = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Google({
      authorization: {
        // `hd` only hints Google's account chooser (single domain); sign-in is
        // enforced in the callback below.
        params: { prompt: "select_account", ...(ALLOWED_DOMAINS.length === 1 ? { hd: ALLOWED_DOMAINS[0] } : {}) },
      },
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      return ALLOWED_DOMAINS.length === 0 || ALLOWED_DOMAINS.some((d) => email.endsWith(`@${d}`));
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  pages: { signIn: "/login" },
});

// DEBUG BYPASS. When __USAFE_PERMANENT_LOGIN is set, every request is authorized
// as that user — no login. The user (looked up by email) must already exist.
// NEVER set this in production.
async function auth(): Promise<Session | null> {
  const email = process.env.__USAFE_PERMANENT_LOGIN?.trim();
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      return {
        user: { id: user.id, name: user.name, email: user.email, image: user.image },
        expires: "9999-12-31T23:59:59.000Z",
      };
    }
  }
  return nextAuth();
}

export { handlers, auth, signIn, signOut };
