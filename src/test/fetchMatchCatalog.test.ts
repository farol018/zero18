import { describe, expect, it, vi } from "vitest";
import { fetchMatchCatalogForImport } from "@/lib/purchaseImport/fetchMatchCatalog";
import type { PurchaseImportModel } from "@/lib/purchaseImport/purchaseImportModel";

const model: PurchaseImportModel = {
  source: "xml",
  externalId: "35200112345678000190550010000000011000000010",
  invoiceNumber: "1",
  invoiceSeries: "1",
  issuedAt: "2026-01-15",
  receivedAt: null,
  supplier: { document: "02.592.961/0002-49", name: "VINHOS DO MUNDO" },
  totalAmount: 25,
  items: [
    {
      lineKey: "1",
      codeInternal: null,
      gtin: "6001660003824",
      supplierProductCode: "004254",
      sku: null,
      name: "CHARDONNAY BOSCHENDAL",
      unit: "UN",
      quantity: 6,
      unitCost: 252.49,
      totalCost: 1514.94,
    },
  ],
};

type Row = Record<string, unknown>;

function mockClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const filters: Array<(row: Row) => boolean> = [];
      const api = {
        select() {
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return api;
        },
        in(column: string, values: unknown[]) {
          const set = new Set(values);
          filters.push((row) => set.has(row[column]));
          return api;
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          const data = rows.filter((row) => filters.every((filter) => filter(row)));
          resolve({ data, error: null });
        },
      };
      return api;
    },
  };
}

describe("fetchMatchCatalogForImport", () => {
  it("loads supplier by document and products by gtin without full-table scan", async () => {
    const client = mockClient({
      suppliers: [
        {
          id: "supplier-vm",
          company_id: "co-1",
          document: "02592961000249",
          name: "VINHOS DO MUNDO",
        },
        {
          id: "other",
          company_id: "co-1",
          document: "11111111000111",
          name: "Outro",
        },
      ],
      products: [
        {
          id: "prod-1",
          company_id: "co-1",
          external_id: null,
          gtin: "6001660003824",
          sku: "VM-004254",
          name: "Chardonnay",
        },
        {
          id: "prod-2",
          company_id: "co-1",
          external_id: null,
          gtin: "9999999999999",
          sku: "OTHER",
          name: "Outro",
        },
      ],
      product_suppliers: [
        {
          company_id: "co-1",
          product_id: "prod-1",
          supplier_id: "supplier-vm",
          supplier_sku: "004254",
        },
      ],
    });

    const catalog = await fetchMatchCatalogForImport(
      client as never,
      "co-1",
      model,
    );

    expect(catalog.suppliers).toEqual([
      { id: "supplier-vm", document: "02592961000249", name: "VINHOS DO MUNDO" },
    ]);
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0].id).toBe("prod-1");
    expect(catalog.productSuppliers).toEqual([
      {
        product_id: "prod-1",
        supplier_id: "supplier-vm",
        supplier_sku: "004254",
      },
    ]);
  });

  it("returns empty suppliers when document is missing", async () => {
    const from = vi.fn();
    const client = { from };
    const catalog = await fetchMatchCatalogForImport(client as never, "co-1", {
      ...model,
      supplier: { document: null, name: null },
      items: [{ ...model.items[0], gtin: null, supplierProductCode: null, sku: null }],
    });
    expect(catalog).toEqual({ suppliers: [], products: [], productSuppliers: [] });
    expect(from).not.toHaveBeenCalled();
  });
});
