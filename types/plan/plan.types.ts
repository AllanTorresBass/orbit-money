import { z } from "zod";
import { isoDateSchema } from "@/types/forecast/forecast.types";
import { entityIdSchema } from "@/types/shared/ids";
import { amountCentsSchema, MAX_AMOUNT_CENTS } from "@/types/shared/money";
import { isSafePaydayRrule } from "@/lib/utils/rrule-guard";

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
  /** When a bill leaves the bank. Null for goals and bills with no schedule. */
  nextDueDate: string | null;
  /** The bill's active outflow schedule, so a payment can settle it. Null for goals. */
  scheduleId: string | null;
  /** What the next payment is expected to be. Null when there is no active schedule. */
  dueAmountCents: number | null;
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
  /** The payday schedule, so a deposit can settle it. */
  scheduleId: string;
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
  targetCapCents: z.number().int().nonnegative().max(MAX_AMOUNT_CENTS).nullable(),
  monthlyInstallmentCents: z.number().int().nonnegative().max(MAX_AMOUNT_CENTS).nullable(),
  dueDate: isoDateSchema.nullable().optional(),
  amountEachPaydayCents: amountCentsSchema.nullable().optional(),
});
export type EnvelopePayload = z.infer<typeof envelopePayloadSchema>;

export const proposalDecisionBodySchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
});

export const reorderEnvelopesBodySchema = z.object({
  tierCategory: z.enum(["fixed", "sinking"]),
  orderedIds: z.array(entityIdSchema).min(1),
});

/** Change a schedule's amount, next date, or repeat rule. Owner and admin only. */
export const updateScheduleBodySchema = z
  .object({
    amountCents: amountCentsSchema.optional(),
    nextDueDate: isoDateSchema.optional(),
    recurrenceRrule: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isSafePaydayRrule, "Unsupported repeat rule")
      .optional(),
  })
  .refine(
    (body) =>
      body.amountCents !== undefined ||
      body.nextDueDate !== undefined ||
      body.recurrenceRrule !== undefined,
    "Nothing to change",
  );
export type UpdateScheduleBody = z.infer<typeof updateScheduleBodySchema>;

export const entityIdParamSchema = z.object({ id: entityIdSchema });

export interface ScheduleMutationResult {
  id: string;
}

/**
 * What removing a bill or goal did. `archived` is true when the envelope left the Plan.
 * A bill that still holds money is only taken off payday (`archived` false) until it is spent.
 */
export interface EnvelopeRemovalResult {
  id: string;
  archived: boolean;
}

/** What moving a goal's leftover money into Spending did. */
export interface EnvelopeMoveResult {
  id: string;
  movedCents: number;
}

export interface EditableEnvelope {
  id: string;
  name: string;
  tierCategory: EditableTier;
  balanceCents: number;
  targetCapCents: number | null;
  monthlyInstallmentCents: number | null;
  /** Current due date from Plan. Null when the bill has no schedule. */
  nextDueDate: string | null;
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
