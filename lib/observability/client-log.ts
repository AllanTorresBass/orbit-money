/** Client reports allowed per person per window. Plenty for real failures, hostile to floods. */
export const CLIENT_LOG_LIMIT = 30;
export const CLIENT_LOG_WINDOW_SECONDS = 60;

/**
 * Counter key for one person's client reports. A different prefix from `magic-link:` keeps it
 * apart in `auth_rate_limits`. The user id is already opaque, so it is stored as is.
 */
export function clientLogRateLimitKey(userId: string): string {
  return `client-log:${userId}`;
}
