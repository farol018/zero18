import { describe, it, expect } from "vitest";
import { resolveSupplierDualRead } from "@/lib/resolveSupplierDualRead";

describe("FEATURE 004 resolveSupplierDualRead", () => {
  it("prefere o vínculo primary de product_suppliers", () => {
    const result = resolveSupplierDualRead(
      {
        supplier_id: "legacy-supplier",
        purchase_multiple: 6,
        cost_price: 10,
      },
      {
        supplier_id: "primary-supplier",
        purchase_multiple: 12,
        cost_price: 9.5,
      },
    );

    expect(result.supplier_id).toBe("primary-supplier");
    expect(result.purchase_multiple).toBe(12);
    expect(result.cost_price).toBe(9.5);
  });

  it("faz fallback para products quando não há primary", () => {
    const result = resolveSupplierDualRead(
      {
        supplier_id: "legacy-supplier",
        purchase_multiple: 6,
        cost_price: 10,
      },
      null,
    );

    expect(result.supplier_id).toBe("legacy-supplier");
    expect(result.purchase_multiple).toBe(6);
    expect(result.cost_price).toBe(10);
  });

  it("retorna sem fornecedor quando ambos estão vazios", () => {
    const result = resolveSupplierDualRead(
      {
        supplier_id: null,
        purchase_multiple: null,
        cost_price: null,
      },
      undefined,
    );

    expect(result.supplier_id).toBeNull();
    expect(result.purchase_multiple).toBe(1);
    expect(result.cost_price).toBeNull();
  });
});
