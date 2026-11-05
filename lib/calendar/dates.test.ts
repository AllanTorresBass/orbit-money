import { describe, expect, it } from "vitest";
import { addDays, daysBetween, daysUntilNextInflow, todayInTimezone } from "@/lib/calendar/dates";

describe("daysUntilNextInflow", () => {
  it("counts half-open [today, nextInflow) for Harbor N_p = 14", () => {
    expect(
      daysUntilNextInflow({
        today: "2026-11-04",
        nextInflow: "2026-11-18",
      }),
    ).toBe(14);
  });

  it("returns 1 when payday is today and unsettled (D8)", () => {
    expect(
      daysUntilNextInflow({
        today: "2026-11-18",
        nextInflow: "2026-11-18",
        inflowIsTodayAndUnsettled: true,
      }),
    ).toBe(1);
  });

  it("returns null when next inflow equals today without the unsettled flag", () => {
    expect(
      daysUntilNextInflow({
        today: "2026-11-18",
        nextInflow: "2026-11-18",
      }),
    ).toBeNull();
  });

  it("returns null when there is no future inflow", () => {
    expect(
      daysUntilNextInflow({
        today: "2026-11-04",
        nextInflow: null,
      }),
    ).toBeNull();
  });
});

describe("daysBetween / addDays", () => {
  it("handles short months", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
});

describe("todayInTimezone", () => {
  it("uses IANA zone for booked date", () => {
    const instant = new Date("2026-11-05T03:30:00.000Z");
    expect(todayInTimezone("America/New_York", instant)).toBe("2026-11-04");
    expect(todayInTimezone("UTC", instant)).toBe("2026-11-05");
  });
});
