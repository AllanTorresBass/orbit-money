import { isApiError } from "@/lib/api/api-error";
import type { AllowanceDto } from "@/types/allowance/allowance.types";

/** Today's number after a purchase that is saved on this phone but not sent yet. Integer cents. */
export function applyQueuedPurchase(allowance: AllowanceDto, amountCents: number): AllowanceDto {
  return {
    ...allowance,
    sTodayCents: allowance.sTodayCents - amountCents,
    spendingBalanceCents: allowance.spendingBalanceCents - amountCents,
    hasPurchaseHistory: true,
  };
}

/**
 * True when the server read the purchase and said no (a 4xx other than "sign in again",
 * "slow down", or "timed out"). Those count against the item. Everything else is retried later.
 */
export function isPurchaseRejection(error: unknown): boolean {
  if (!isApiError(error)) return false;
  const { status } = error;
  if (status === 401 || status === 403 || status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

/** True when the failure is the network, not the server. The purchase can wait on the device. */
export function isNetworkFailure(error: unknown): boolean {
  if (isApiError(error)) return false;
  const message = error instanceof Error ? error.message : "";
  return message === "Failed to fetch" || message.toLowerCase().includes("network");
}
