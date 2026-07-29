import { describe, it, expect } from "vitest";
import type { Database } from "@/integrations/supabase/types";

type ProductSupplier = Database["public"]["Tables"]["product_suppliers"]["Row"];
type ProductSupplierInsert = Database["public"]["Tables"]["product_suppliers"]["Insert"];

/**
 * FEATURE 001 — contrato do modelo product_suppliers (MVP).
 * Garante que a tipagem expõe a fundação aprovada sem depender do runtime do banco.
 */
describe("FEATURE 001 product_suppliers contract", () => {
  it("exige identidade do vínculo e flags operacionais no Row", () => {
    const row: ProductSupplier = {
      id: "00000000-0000-0000-0000-000000000001",
      company_id: "00000000-0000-0000-0000-000000000002",
      product_id: "00000000-0000-0000-0000-000000000003",
      supplier_id: "00000000-0000-0000-0000-000000000004",
      is_primary: true,
      is_active: true,
      supplier_sku: null,
      lead_time_days: null,
      purchase_multiple: 1,
      cost_price: null,
      min_order_qty: null,
      notes: null,
      source: "migration",
      external_ref: null,
      created_at: "2026-07-28T00:00:00.000Z",
      updated_at: "2026-07-28T00:00:00.000Z",
    };

    expect(row.is_primary).toBe(true);
    expect(row.is_active).toBe(true);
    expect(row.purchase_multiple).toBe(1);
    expect(row.source).toBe("migration");
  });

  it("permite Insert mínimo só com chaves do vínculo", () => {
    const insert: ProductSupplierInsert = {
      company_id: "00000000-0000-0000-0000-000000000002",
      product_id: "00000000-0000-0000-0000-000000000003",
      supplier_id: "00000000-0000-0000-0000-000000000004",
    };

    expect(insert.company_id).toBeTruthy();
    expect(insert.product_id).toBeTruthy();
    expect(insert.supplier_id).toBeTruthy();
  });

  it("mantém products.supplier_id no schema (compatibilidade)", () => {
    type Product = Database["public"]["Tables"]["products"]["Row"];
    const keys: Array<keyof Product> = ["supplier_id", "purchase_multiple", "cost_price"];
    expect(keys).toContain("supplier_id");
  });
});
