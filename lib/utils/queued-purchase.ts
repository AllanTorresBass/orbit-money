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
