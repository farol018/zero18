import { describe, it, expect } from "vitest";
import { buildPurchaseListHierarchy } from "@/lib/purchaseListGrouping";
import type { FarolItem } from "@/hooks/useFarol";

function item(partial: Partial<FarolItem> & Pick<FarolItem, "product_id" | "product_name">): FarolItem {
  return {
    estoque_atual: 0,
    consumo_medio_dia: 1,
    dias_estoque: 0,
    status_estoque: "🔴 risco",
    sugestao_compra: 12,
    alerta: null,
    effective_status: "risco",
    purchase_multiple: 6,
    cost_price: 10,
    external_id: null,
    sku: null,
    supplier_id: "s1",
    supplier_name: "Fornecedor A",
    category_id: "c1",
    category_name: "Tintos",
    ...partial,
  };
}

describe("FEATURE 008 purchaseListGrouping", () => {
  it("agrupa por categoria e depois por fornecedor", () => {
    const items = [
      item({ product_id: "1", product_name: "A", category_id: "c1", category_name: "Tintos", supplier_id: "s1", supplier_name: "Alpha" }),
      item({ product_id: "2", product_name: "B", category_id: "c1", category_name: "Tintos", supplier_id: "s2", supplier_name: "Beta" }),
      item({ product_id: "3", product_name: "C", category_id: "c2", category_name: "Brancos", supplier_id: "s1", supplier_name: "Alpha" }),
    ];

    const { categories, totals } = buildPurchaseListHierarchy(items, "category");
    expect(categories).toHaveLength(2);
    expect(totals.itemCount).toBe(3);
    expect(totals.supplierCount).toBe(2);

    const tintos = categories.find((c) => c.category_name === "Tintos")!;
    expect(tintos.suppliers).toHaveLength(2);
    expect(tintos.itemCount).toBe(2);
  });

  it("calcula caixas e valor por fornecedor", () => {
    const items = [
      item({
        product_id: "1",
        product_name: "A",
        sugestao_compra: 12,
        purchase_multiple: 6,
        cost_price: 10,
      }),
    ];
    const { categories } = buildPurchaseListHierarchy(items);
    const supplier = categories[0].suppliers[0];
    expect(supplier.totalUnits).toBe(12);
    expect(supplier.totalBoxes).toBe(2);
    expect(supplier.totalValue).toBe(120);
  });

  it("coloca sem categoria no bucket padrão", () => {
    const items = [
      item({
        product_id: "1",
        product_name: "A",
        category_id: null,
        category_name: null,
      }),
    ];
    const { categories } = buildPurchaseListHierarchy(items);
    expect(categories[0].category_name).toBe("Sem categoria");
  });
});
