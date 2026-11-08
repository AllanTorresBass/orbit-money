import { isApiError } from "@/lib/api/api-error";
import { pushInlineFeedback } from "@/lib/feedback/inline-feedback-store";
import { logger } from "@/lib/logger";
import { reportClientLog } from "@/lib/observability/report-client-log";

export interface CrudErrorCopy {
  cannot: string;
  couldNot: string;
  chooseHousehold: string;
}

export interface HandleCrudErrorOptions {
  /** What failed, already translated: "save the bill". */
  action: string;
  copy?: CrudErrorCopy;
}

const EN_COPY: CrudErrorCopy = {
  cannot: "You can't {action}.",
  couldNot: "Could not {action}.",
  chooseHousehold: "Choose a household to continue.",
};

function fill(template: string, action: string): string {
  return template.replaceAll("{action}", action);
}

/** Message safe to show a person for a failed create, update, or delete. */
export function crudErrorMessage(
  error: unknown,
  action: string,
  copy: CrudErrorCopy = EN_COPY,
): string {
  if (isApiError(error)) {
    if (error.status === 403) {
      return fill(copy.cannot, action);
    }
    if (error.code === "tenant_selection_required") {
      return copy.chooseHousehold;
    }
    // Server messages are already plain ("Already on this team").
    if (error.status >= 400 && error.status < 500 && error.message) {
      return error.message;
    }
  }
  return fill(copy.couldNot, action);
}

/** Log and show an inline sentence for a failed write. Returns the message. */
export function handleCrudError(error: unknown, options: HandleCrudErrorOptions): string {
  const message = crudErrorMessage(error, options.action, options.copy);
  logger.error("Mutation failed", {
    action: options.action,
    error: error instanceof Error ? error.message : "unknown",
  });
  pushInlineFeedback("short", message);
  // The server log is where an operator looks. Status only: no message text, no amounts.
  reportClientLog(
    "warn",
    isApiError(error)
      ? `Save failed (${options.action}, ${error.status})`
      : `Save failed (${options.action})`,
  );
  return message;
}

/** Show an inline sentence for a successful write. */
export function notifyCrudSuccess(message: string): void {
  pushInlineFeedback("low", message);
}
