import { isApiError } from "@/lib/api/api-error";
import { pushInlineFeedback } from "@/lib/feedback/inline-feedback-store";
import { logger } from "@/lib/logger";

export interface FetchErrorCopy {
  chooseHousehold: string;
  signIn: string;
  cannotSee: string;
  offline: string;
  couldNotLoad: string;
}

export interface HandleFetchErrorOptions {
  /** Already-translated resource phrase: "today", "your people". */
  resource: string;
  copy?: FetchErrorCopy;
  /** Also show the message inline. Off by default: screens render their own error state. */
  notify?: boolean;
}

const EN_COPY: FetchErrorCopy = {
  chooseHousehold: "Choose a household to continue.",
  signIn: "Sign in to continue.",
  cannotSee: "You can't see {resource}.",
  offline: "You're offline.",
  couldNotLoad: "Could not load {resource}.",
};

function fill(template: string, resource: string): string {
  return template.replaceAll("{resource}", resource);
}

/** Message safe to show a person for a failed read. */
export function fetchErrorMessage(
  error: unknown,
  resource: string,
  copy: FetchErrorCopy = EN_COPY,
): string {
  if (isApiError(error)) {
    if (error.code === "tenant_selection_required") {
      return copy.chooseHousehold;
    }
    if (error.status === 401) {
      return copy.signIn;
    }
    if (error.status === 403) {
      return fill(copy.cannotSee, resource);
    }
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return copy.offline;
  }
  return fill(copy.couldNotLoad, resource);
}

/** Log and (optionally) show an inline sentence for a failed read. Returns the message. */
export function handleFetchError(error: unknown, options: HandleFetchErrorOptions): string {
  const message = fetchErrorMessage(error, options.resource, options.copy);
  logger.error("Fetch failed", {
    resource: options.resource,
    error: error instanceof Error ? error.message : "unknown",
  });
  if (options.notify ?? false) {
    pushInlineFeedback("short", message);
  }
  return message;
}
