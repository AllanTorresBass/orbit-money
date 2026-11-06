import { z } from "zod";

/**
 * Largest single amount in cents: $99,999,999.99. Well inside NUMERIC(12, 2), and far enough
 * below the integer limit that a sum of a few cannot overflow a JavaScript safe integer.
 */
export const MAX_AMOUNT_CENTS = 99_999_999_99;

/** A positive whole number of cents no larger than `MAX_AMOUNT_CENTS`. */
export const amountCentsSchema = z.number().int().positive().max(MAX_AMOUNT_CENTS);
