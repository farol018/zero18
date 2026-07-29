import { describe, expect, it } from "vitest";
import { lineTotal, sumPurchaseTotal } from "@/lib/purchaseTotals";

describe("FEATURE 009 purchaseTotals", () => {
  it("calculates line total", () => {
    expect(lineTotal(12, 10)).toBe(120);
    expect(lineTotal(1.5, 10)).toBe(15);
  });

  it("sums purchase total from items", () => {
    expect(
      sumPurchaseTotal([
        { quantity: 12, unit_cost: 10 },
        { quantity: 2, unit_cost: 5.5 },
      ]),
    ).toBe(131);
  });
});
