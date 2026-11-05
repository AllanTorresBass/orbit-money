import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { withTransaction } from "@/lib/db/connection";
import { HARBOR } from "@/lib/dev/harbor-ids";

declare module "next-auth" {
  interface Session {
    userId: string;
    tenantId: string;
  }

  interface User {
    tenantId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
    tenantId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
        if (!email) return null;

        return withTransaction(null, async (client) => {
          await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
          const user = await client.query<{ id: string; name: string; email: string }>(
            `SELECT id, name, email FROM users WHERE email = $1`,
            [email],
          );
          const row = user.rows[0];
          if (!row) return null;

          const membership = await client.query<{ tenant_id: string }>(
            `SELECT tenant_id FROM tenant_memberships
             WHERE user_id = $1 AND status = 'active'
             ORDER BY created_at ASC
             LIMIT 1`,
            [row.id],
          );
          const tenantId = membership.rows[0]?.tenant_id ?? HARBOR.tenantId;

          return {
            id: row.id,
            email: row.email,
            name: row.name,
            tenantId,
          };
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = user.tenantId ?? HARBOR.tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      session.userId = token.userId ?? "";
      session.tenantId = token.tenantId ?? HARBOR.tenantId;
      if (session.user) {
        session.user.id = token.userId ?? "";
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
  session: { strategy: "jwt" },
  trustHost: true,
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "orbit-dev-secret-change-me"),
});
