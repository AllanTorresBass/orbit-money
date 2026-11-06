import { describe, expect, it } from "vitest";
import { defaultBillDueDate } from "@/lib/utils/default-due-date";

describe("defaultBillDueDate", () => {
  it("is one week from the given day", () => {
    expect(defaultBillDueDate(new Date(2026, 10, 6))).toBe("2026-11-13");
  });

  it("rolls over month and year ends", () => {
    expect(defaultBillDueDate(new Date(2026, 11, 28))).toBe("2027-01-04");
  });
});
