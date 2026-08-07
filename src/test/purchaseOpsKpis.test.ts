import { describe, expect, it } from "vitest";
import {
  formatConfirmedVsDraftPct,
  parsePurchaseOpsKpis,
} from "@/lib/purchaseOpsKpis";

describe("parsePurchaseOpsKpis", () => {
  it("normaliza números e top suppliers", () => {
    const raw = {
      windows: {
        d14: {
          confirmed_count: "2",
          confirmed_amount: "100.5",
          cancelled_count: 1,
          confirmed_vs_draft_pct: 66.6,
        },
        d30: {
          confirmed_count: 0,
          confirmed_amount: 0,
          cancelled_count: 0,
          confirmed_vs_draft_pct: null,
        },
      },
      drafts_open: { total: 3, bling: 1, farol: 1, other: 1 },
      top_suppliers_d30: [
        {
          supplier_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          name: "ACME",
          amount: "50",
          count: "2",
        },
      ],
    };
    const k = parsePurchaseOpsKpis(raw);
    expect(k.windows.d14.confirmed_count).toBe(2);
    expect(k.windows.d14.confirmed_amount).toBe(100.5);
    expect(k.windows.d14.confirmed_vs_draft_pct).toBeCloseTo(66.6);
    expect(k.windows.d30.confirmed_vs_draft_pct).toBeNull();
    expect(k.drafts_open).toEqual({ total: 3, bling: 1, farol: 1, other: 1 });
    expect(k.top_suppliers_d30[0]).toEqual({
      supplier_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "ACME",
      amount: 50,
      count: 2,
    });
  });

  it("rejeita payload sem windows", () => {
    expect(() => parsePurchaseOpsKpis({})).toThrow();
  });
});

describe("formatConfirmedVsDraftPct", () => {
  it("formata null e número", () => {
    expect(formatConfirmedVsDraftPct(null)).toBe("—");
    expect(formatConfirmedVsDraftPct(66.6)).toBe("67%");
  });
});
