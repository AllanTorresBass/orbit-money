import { z } from "zod";
import { isoDateSchema } from "@/types/forecast/forecast.types";
import { entityIdSchema } from "@/types/shared/ids";

export type PlanTier = "fixed" | "sinking" | "discretionary";
export type EditableTier = "fixed" | "sinking";

export interface PlanEnvelopeDto {
  id: string;
  name: string;
  tierCategory: PlanTier;
  priorityOrder: number;
  balanceCents: number;
  targetCapCents: number | null;
  monthlyInstallmentCents: number | null;
}

export interface PlanPurchaseDto {
  id: string;
  amountCents: number;
  memo: string | null;
  bookedAt: string;
}

export interface PlanPaydayDto {
  amountCents: number;
  date: string;
}

export interface PlanDto {
  bills: PlanEnvelopeDto[];
  goals: PlanEnvelopeDto[];
  spending: PlanEnvelopeDto | null;
  recentPurchases: PlanPurchaseDto[];
  /** Next payday amount and date, when a schedule exists. */
  payday: PlanPaydayDto | null;
  /** True when the last cycle-end sweep could not move every leftover cent. */
  sweepIncomplete: boolean;
}

export const envelopePayloadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tierCategory: z.enum(["fixed", "sinking"]),
  targetCapCents: z.number().int().nonnegative().nullable(),
  monthlyInstallmentCents: z.number().int().nonnegative().nullable(),
  dueDate: isoDateSchema.nullable().optional(),
  amountEachPaydayCents: z.number().int().positive().nullable().optional(),
});
export type EnvelopePayload = z.infer<typeof envelopePayloadSchema>;

export const proposalDecisionBodySchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
});

export const reorderEnvelopesBodySchema = z.object({
  tierCategory: z.enum(["fixed", "sinking"]),
  orderedIds: z.array(entityIdSchema).min(1),
});

export interface EditableEnvelope {
  id: string;
  name: string;
  tierCategory: EditableTier;
  balanceCents: number;
  targetCapCents: number | null;
  monthlyInstallmentCents: number | null;
}

export interface ProposalDto {
  id: string;
  envelopeId: string | null;
  proposedBy: string;
  proposedByName: string;
  payload: EnvelopePayload;
  status: string;
  createdAt: string;
}

export interface ProposalListResponse {
  proposals: ProposalDto[];
}

export interface EnvelopeMutationResult {
  id?: string;
  proposalId?: string;
}

export type ReorderEnvelopesBody = z.infer<typeof reorderEnvelopesBodySchema>;

export type ProposalDecision = "accepted" | "rejected";
