import PostgresAdapter from "@auth/pg-adapter";
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { ensureUserByEmail } from "@/lib/auth/ensure-user";
import {
  consumeRateLimit,
  MAGIC_LINK_LIMIT,
  MAGIC_LINK_WINDOW_SECONDS,
  magicLinkRateLimitKey,
} from "@/lib/auth/rate-limit";
import { isDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { renderSignInEmail } from "@/lib/email/sign-in-email";
import { sendResendEmail } from "@/lib/email/resend";
import { getPool, withTransaction } from "@/lib/db/connection";
import { logger } from "@/lib/logger";

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

async function resolveUserTenant(email: string): Promise<{
  id: string;
  email: string;
  name: string;
  tenantId?: string;
} | null> {
  return withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const user = await client.query<{ id: string; name: string; email: string }>(
      `SELECT id, name, email FROM users WHERE email = $1`,
      [email],
    );
    const row = user.rows[0];
    if (!row) return null;

    const memberships = await client.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM tenant_memberships
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at ASC`,
      [row.id],
    );
    const tenantId = memberships.rows.length === 1 ? memberships.rows[0].tenant_id : undefined;

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      tenantId,
    };
  });
}

const providers: NextAuthConfig["providers"] = [];

// Harbor demo only — email-only credentials must never ship in production.
if (isDevHeaderAuthEnabled()) {
  providers.push(
    Credentials({
      id: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
        if (!email) return null;
        return resolveUserTenant(email);
      },
    }),
  );
}

const magicLinkConfigured = Boolean(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM);

if (magicLinkConfigured) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
      normalizeIdentifier: (identifier: string) => identifier.trim().toLowerCase(),
      async sendVerificationRequest({ identifier, url, provider }) {
        const { host } = new URL(url);
        const message = renderSignInEmail({ url });
        const messageId = await sendResendEmail(
          { to: identifier, ...message },
          { apiKey: provider.apiKey, from: provider.from },
        );
        logger.info("Magic-link email sent", { host, messageId });
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // Verification tokens live in Postgres (007_auth_tables.sql). Sessions remain JWT.
  adapter: magicLinkConfigured ? PostgresAdapter(getPool()) : undefined,
  callbacks: {
    async signIn({ user, email }) {
      // Magic-link request: ensure a users row so Create can require a session.
      // Unknown emails get a user with no membership, then a link.
      if (email?.verificationRequest) {
        const address = user?.email?.trim().toLowerCase();
        if (!address) return false;
        // Refuse floods before a users row is created or a mail is sent.
        try {
          const limit = await consumeRateLimit({
            key: magicLinkRateLimitKey(address),
            limit: MAGIC_LINK_LIMIT,
            windowSeconds: MAGIC_LINK_WINDOW_SECONDS,
          });
          if (!limit.allowed) {
            logger.warn("Magic-link rate limit hit", {
              hits: limit.hits,
              retryAfterSeconds: limit.retryAfterSeconds,
            });
            return false;
          }
        } catch (error: unknown) {
          // Fail closed: no counter, no mail.
          logger.error("Magic-link rate limit check failed", {
            error: error instanceof Error ? error.message : "unknown",
          });
          return false;
        }
        await ensureUserByEmail({ email: address });
        return true;
      }
      if (user?.email) {
        const existing = await resolveUserTenant(user.email.toLowerCase());
        return existing !== null;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = user.tenantId;
      }
      if ((!token.userId || token.tenantId === undefined) && token.email) {
        const existing = await resolveUserTenant(String(token.email).toLowerCase());
        if (existing) {
          token.userId = existing.id;
          token.tenantId = existing.tenantId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.userId = token.userId ?? "";
      session.tenantId = token.tenantId ?? "";
      if (session.user) {
        session.user.id = token.userId ?? "";
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  session: { strategy: "jwt" },
  trustHost: true,
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "orbit-dev-secret-change-me"),
});
