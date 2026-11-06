export interface RequestIdentity {
  userId: string;
  /** Explicit tenant from the household cookie, the Auth.js session, or the dev header. */
  tenantId: string | null;
  /**
   * The Auth.js session tenant, kept when the cookie won. Used only when the cookie names a
   * household the person no longer belongs to, so a stale cookie cannot lock them out.
   */
  fallbackTenantId?: string | null;
}

/**
 * The household the person chose in the app (cookie) beats the one pinned into the Auth.js
 * token at sign-in. The token is minted once and never updated, so after a switch it would
 * keep pointing at the first household. Membership is still checked by the caller.
 */
export function pickTenantForSession(input: {
  userId: string;
  sessionTenantId: string | undefined;
  cookieTenantId: string | undefined;
}): RequestIdentity {
  const fromSession = input.sessionTenantId || null;
  const fromCookie = input.cookieTenantId || null;
  if (fromCookie) {
    return { userId: input.userId, tenantId: fromCookie, fallbackTenantId: fromSession };
  }
  return { userId: input.userId, tenantId: fromSession };
}
