import { describe, expect, it } from "vitest";
import { expandSchedules } from "@/lib/calendar/expand-schedules";
import { getHolidaySet } from "@/lib/calendar/holidays";

describe("expandSchedules", () => {
  it("shifts Saturday outflow to the next business day", () => {
    const holidays = getHolidaySet("US", 2026);
    const { eventsByDate } = expandSchedules({
      schedules: [
        {
          amount: "100.00",
          direction: "outflow",
          nextDueDate: "2026-11-14", // Saturday
          recurrenceRrule: "FREQ=MONTHLY;BYMONTHDAY=14",
        },
      ],
      today: "2026-11-01",
      holidays,
    });
    expect(eventsByDate["2026-11-14"]).toBeUndefined();
    expect(eventsByDate["2026-11-16"]?.outflowCents).toBe(10_000);
  });

  it("shifts Saturday inflow to the previous business day", () => {
    const holidays = getHolidaySet("US", 2026);
    const { eventsByDate, paydayDates } = expandSchedules({
      schedules: [
        {
          amount: "3000.00",
          direction: "inflow",
          nextDueDate: "2026-11-14",
          recurrenceRrule: "FREQ=MONTHLY;BYMONTHDAY=14",
        },
      ],
      today: "2026-11-01",
      holidays,
    });
    expect(eventsByDate["2026-11-13"]?.inflowCents).toBe(300_000);
    expect(paydayDates).toContain("2026-11-13");
  });
});
