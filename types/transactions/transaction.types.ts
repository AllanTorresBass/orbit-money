import { z } from "zod";
import { isoDateSchema } from "@/types/forecast/forecast.types";
import { entityIdSchema } from "@/types/shared/ids";

export const createPurchaseBodySchema = z.object({
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(1).max(200).optional(),
  memo: z.string().max(200).optional(),
  /**
   * Tenant-local date the money was spent. An offline purchase carries the day it was made,
   * not the day it reached the server. Not after tomorrow in the household's timezone.
   */
  bookedDate: isoDateSchema.optional(),
});
export type CreatePurchaseBody = z.infer<typeof createPurchaseBodySchema>;

/** A payday (or any money in). Owner and admin only. */
export const recordInflowBodySchema = z.object({
  amountCents: z.number().int().positive(),
  /** Tenant-local date. Defaults to today. */
  bookedDate: isoDateSchema.optional(),
  accountId: entityIdSchema.optional(),
  /** The payday schedule this deposit settles. */
  scheduleId: entityIdSchema.optional(),
  idempotencyKey: z.string().min(1).max(200),
  memo: z.string().max(200).optional(),
});
export type RecordInflowBody = z.infer<typeof recordInflowBodySchema>;

/** A bill leaving the bank. Owner and admin only. */
export const recordOutflowBodySchema = z.object({
  amountCents: z.number().int().positive(),
  bookedDate: isoDateSchema.optional(),
  accountId: entityIdSchema.optional(),
  /** The bill schedule this payment settles. Supplies the envelope when `envelopeId` is absent. */
  scheduleId: entityIdSchema.optional(),
  envelopeId: entityIdSchema.optional(),
  idempotencyKey: z.string().min(1).max(200),
  memo: z.string().max(200).optional(),
});
export type RecordOutflowBody = z.infer<typeof recordOutflowBodySchema>;

export interface TransactionResult {
  id: string;
  sTodayCents: number | null;
}

/** A purchase saved on this device because the network was down. */
export interface QueuedPurchase {
  id: string;
  amountCents: number;
  idempotencyKey: string;
  memo?: string;
  /** Local date (YYYY-MM-DD) the purchase was made. Absent on items saved before this field. */
  bookedDate?: string;
  createdAt: string;
  /** Send attempts the server turned away. */
  failures: number;
}

/** Whose queue it is. A purchase never crosses households or people. */
export interface OfflineQueueScope {
  tenantId: string;
  userId: string;
}
