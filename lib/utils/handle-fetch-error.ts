import { isApiError } from "@/lib/api/api-error";
import { pushInlineFeedback } from "@/lib/feedback/inline-feedback-store";
import { logger } from "@/lib/logger";

export interface HandleFetchErrorOptions {
  /** What was being loaded, in plain words: "today", "your people". */
  resource: string;
  /** Also show the message inline. Off by default: screens render their own error state. */
  notify?: boolean;
}

/** Message safe to show a person for a failed read. */
export function fetchErrorMessage(error: unknown, resource: string): string {
  if (isApiError(error)) {
    if (error.code === "tenant_selection_required") {
      return "Choose a household to continue.";
    }
    if (error.status === 401) {
      return "Sign in to continue.";
    }
    if (error.status === 403) {
      return `You can't see ${resource}.`;
    }
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "You're offline.";
  }
  return `Could not load ${resource}.`;
}

/** Log and (optionally) show an inline sentence for a failed read. Returns the message. */
export function handleFetchError(error: unknown, options: HandleFetchErrorOptions): string {
  const message = fetchErrorMessage(error, options.resource);
  logger.error("Fetch failed", {
    resource: options.resource,
    error: error instanceof Error ? error.message : "unknown",
  });
  if (options.notify ?? false) {
    pushInlineFeedback("short", message);
  }
  return message;
}
