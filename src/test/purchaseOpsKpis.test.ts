import { describe, expect, it } from "vitest";
import {
  averageTicket,
  formatConfirmedVsDraftPct,
  formatSharePct,
  parsePurchaseOpsKpis,
  supplierSharePct,
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
      drafts_open: { total: 3, total_amount: "18450.5", bling: 1, farol: 1, other: 1 },
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
    expect(k.drafts_open).toEqual({
      total: 3,
      total_amount: 18450.5,
      bling: 1,
      farol: 1,
      other: 1,
    });
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

  it("default total_amount 0 se ausente", () => {
    const k = parsePurchaseOpsKpis({
      windows: {
        d14: {
          confirmed_count: 0,
          confirmed_amount: 0,
          cancelled_count: 0,
          confirmed_vs_draft_pct: null,
        },
        d30: {
          confirmed_count: 0,
          confirmed_amount: 0,
          cancelled_count: 0,
          confirmed_vs_draft_pct: null,
        },
      },
      drafts_open: { total: 0, bling: 0, farol: 0, other: 0 },
      top_suppliers_d30: [],
    });
    expect(k.drafts_open.total_amount).toBe(0);
  });
});

describe("formatConfirmedVsDraftPct", () => {
  it("formata null e número", () => {
    expect(formatConfirmedVsDraftPct(null)).toBe("—");
    expect(formatConfirmedVsDraftPct(66.6)).toBe("67%");
  });
});

describe("averageTicket", () => {
  it("calcula ou retorna null", () => {
    expect(averageTicket(100, 4)).toBe(25);
    expect(averageTicket(100, 0)).toBeNull();
  });
});

describe("supplierSharePct", () => {
  it("calcula participação sobre o total 30d", () => {
    expect(supplierSharePct(327000, 333000)).toBeCloseTo(98.198, 2);
    expect(supplierSharePct(50, 0)).toBeNull();
    expect(formatSharePct(98.198)).toBe("98%");
    expect(formatSharePct(null)).toBe("—");
  });
});
