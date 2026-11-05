export type TierCategory = "fixed" | "sinking" | "discretionary";
export type RolloverPolicy = "top_up" | "accumulate" | "reset_sweep";

export interface EnvelopeState {
  id: string;
  name: string;
  tierCategory: TierCategory;
  priorityOrder: number;
  currentBalanceCents: number;
  targetCapCents: number | null;
  monthlyInstallmentCents: number | null;
  rolloverPolicy: RolloverPolicy;
  sweepEnvelopeId: string | null;
}

export interface AllocationResult {
  envelopeId: string;
  amountCents: number;
}
