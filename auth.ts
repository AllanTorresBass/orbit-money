import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { HARBOR_DEFAULTS } from "@/lib/dev/harbor";

/**
 * Auth.js scaffold. Phase-1 UI still uses x-user-id / x-tenant-id headers.
 * Credentials provider maps Harbor seed emails for a later swap.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = typeof credentials.email === "string" ? credentials.email : "";
        const map: Record<string, { id: string; name: string }> = {
          "alex@harbor.test": { id: HARBOR_DEFAULTS.alexId, name: "Alex" },
          "blair@harbor.test": { id: HARBOR_DEFAULTS.blairId, name: "Blair" },
          "casey@harbor.test": { id: HARBOR_DEFAULTS.caseyId, name: "Casey" },
        };
        const user = map[email.toLowerCase()];
        if (!user) return null;
        return { id: user.id, email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET ?? "orbit-dev-secret-change-me",
});
