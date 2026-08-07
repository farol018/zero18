import { describe, expect, it } from "vitest";
import { buildFarolPurchaseSeed } from "@/lib/purchaseImport/buildFarolPurchaseSeed";

const base = {
  product_id: "p1",
  product_name: "Vinho X",
  sugestao_compra: 10.4,
  cost_price: 42,
  supplier_id: "s1",
  supplier_name: "Forn",
};

describe("buildFarolPurchaseSeed", () => {
  it("maps qty round and unit_cost", () => {
    const r = buildFarolPurchaseSeed({
      supplierId: "s1",
      supplierName: "Forn",
      items: [base as any],
      issuedAt: "2026-08-06",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seed.items[0].quantity).toBe(10);
    expect(r.seed.items[0].unit_cost).toBe(42);
    expect(r.seed.source).toBe("farol");
  });

  it("skips null cost and counts skippedNoCost", () => {
    const r = buildFarolPurchaseSeed({
      supplierId: "s1",
      supplierName: "Forn",
      items: [
        base as any,
        { ...base, product_id: "p2", cost_price: null } as any,
      ],
      issuedAt: "2026-08-06",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seed.items).toHaveLength(1);
    expect(r.seed.skippedNoCost).toBe(1);
  });

  it("skips zero cost as invalid", () => {
    const r = buildFarolPurchaseSeed({
      supplierId: "s1",
      supplierName: "Forn",
      items: [{ ...base, cost_price: 0 } as any],
      issuedAt: "2026-08-06",
    });
    expect(r.ok).toBe(false);
  });

  it("returns no_eligible when all skipped", () => {
    const r = buildFarolPurchaseSeed({
      supplierId: "s1",
      supplierName: "Forn",
      items: [{ ...base, cost_price: null } as any],
      issuedAt: "2026-08-06",
    });
    expect(r.ok).toBe(false);
  });
});
