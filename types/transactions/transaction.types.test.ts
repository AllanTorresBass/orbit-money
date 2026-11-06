import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_CENTS } from "@/types/shared/money";
import {
  createPurchaseBodySchema,
  recordInflowBodySchema,
  recordOutflowBodySchema,
} from "@/types/transactions/transaction.types";

describe("ledger body schemas", () => {
  it("requires an idempotency key and whole positive cents", () => {
    expect(recordInflowBodySchema.safeParse({ amountCents: 300_000 }).success).toBe(false);
    expect(
      recordInflowBodySchema.safeParse({ amountCents: 30.5, idempotencyKey: "k" }).success,
    ).toBe(false);
    expect(recordInflowBodySchema.safeParse({ amountCents: 0, idempotencyKey: "k" }).success).toBe(
      false,
    );
    expect(
      recordInflowBodySchema.safeParse({
        amountCents: 300_000,
        idempotencyKey: "k",
        bookedDate: "2026-11-13",
      }).success,
    ).toBe(true);
  });

  it("rejects a date that is not on the calendar", () => {
    expect(
      recordOutflowBodySchema.safeParse({
        amountCents: 100,
        idempotencyKey: "k",
        bookedDate: "2026-02-30",
      }).success,
    ).toBe(false);
  });

  it("caps an amount at what NUMERIC(12, 2) and a safe integer sum can hold", () => {
    expect(createPurchaseBodySchema.safeParse({ amountCents: MAX_AMOUNT_CENTS }).success).toBe(true);
    expect(createPurchaseBodySchema.safeParse({ amountCents: MAX_AMOUNT_CENTS + 1 }).success).toBe(
      false,
    );
    expect(
      recordInflowBodySchema.safeParse({ amountCents: MAX_AMOUNT_CENTS + 1, idempotencyKey: "k" })
        .success,
    ).toBe(false);
    expect(
      recordOutflowBodySchema.safeParse({ amountCents: MAX_AMOUNT_CENTS + 1, idempotencyKey: "k" })
        .success,
    ).toBe(false);
  });
});
