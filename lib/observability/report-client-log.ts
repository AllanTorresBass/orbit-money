import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import type { ClientLogLevel } from "@/types/observability/client-log.types";

/** The same line is sent at most once in this window, so a retry loop cannot flood the server. */
const DEDUPE_WINDOW_MS = 10_000;
/** Reports one page load may send. The server rate limit is the backstop. */
const MAX_REPORTS_PER_PAGE = 25;

const recent = new Map<string, number>();
let sent = 0;

/**
 * Tell the server about something that went wrong in the browser. Fire and forget: a failure to
 * report never reaches the person and never reports itself. Send no amounts, names, or emails.
 */
export function reportClientLog(level: ClientLogLevel, message: string, route?: string): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const key = `${level}:${message}`;
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return;
  if (sent >= MAX_REPORTS_PER_PAGE) return;
  recent.set(key, now);
  sent += 1;

  api
    .sendClientLog({
      level,
      message: message.slice(0, 300),
      route: route ?? window.location.pathname,
    })
    .catch((error: unknown) => {
      logger.debug("Client report not delivered", {
        error: error instanceof Error ? error.message : "unknown",
      });
    });
}
