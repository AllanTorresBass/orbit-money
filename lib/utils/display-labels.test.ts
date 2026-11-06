import { describe, expect, it } from "vitest";
import { billSetAsideLabel } from "@/lib/utils/display-labels";
import { formatMoney } from "@/lib/utils";

describe("billSetAsideLabel", () => {
  it("reads Set aside once the ceiling is covered", () => {
    expect(billSetAsideLabel(120_000, 120_000, formatMoney)).toEqual({
      text: "Set aside $1,200",
      covered: true,
    });
  });

  it("shows how much is set aside while a bill is still short", () => {
    expect(billSetAsideLabel(4_000, 18_000, formatMoney)).toEqual({
      text: "$40 of $180 set aside",
      covered: false,
    });
  });

  it("shows the balance when there is no ceiling", () => {
    expect(billSetAsideLabel(4_000, null, formatMoney).text).toBe("$40");
  });
});
