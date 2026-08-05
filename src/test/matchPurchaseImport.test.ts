import { describe, expect, it } from "vitest";
import { matchPurchaseImport, type MatchCatalog } from "@/lib/purchaseImport/matchPurchaseImport";
import type { PurchaseImportModel } from "@/lib/purchaseImport/purchaseImportModel";

const model: PurchaseImportModel = {
  source: "xml",
  externalId: "35200112345678000190550010000000011000000010",
  invoiceNumber: "1",
  invoiceSeries: "1",
  issuedAt: "2026-01-15",
  receivedAt: null,
  supplier: { document: "12.345.678/0001-90", name: "Fornecedor Teste" },
  totalAmount: 25,
  items: [
    {
      lineKey: "1",
      codeInternal: "INT-1",
      gtin: "7891234567890",
      supplierProductCode: "SUP-1",
      sku: "SKU-1",
      name: "Produto A",
      unit: "UN",
      quantity: 10,
      unitCost: 2.5,
      totalCost: 25,
    },
  ],
};

const catalog: MatchCatalog = {
  suppliers: [{ id: "supplier-1", document: "12345678000190", name: "Fornecedor Teste" }],
  products: [
    { id: "external", external_id: "INT-1", gtin: "7891234567890", sku: "SKU-1", name: "Produto A" },
    { id: "gtin", external_id: null, gtin: "7891234567890", sku: null, name: "Outro" },
    { id: "supplier-code", external_id: null, gtin: null, sku: null, name: "Outro" },
    { id: "sku", external_id: null, gtin: null, sku: "SKU-1", name: "Outro" },
  ],
  productSuppliers: [
    { product_id: "supplier-code", supplier_id: "supplier-1", supplier_sku: "SUP-1" },
  ],
};

describe("matchPurchaseImport", () => {
  it("matches a supplier by normalized document", () => {
    const result = matchPurchaseImport(model, catalog);

    expect(result.supplierId).toBe("supplier-1");
    expect(result.supplierMatchCriteria).toBe("document");
  });

  it("uses the first unique product criterion in priority order", () => {
    const result = matchPurchaseImport(model, catalog);

    expect(result.items[0]).toMatchObject({
      productId: "external",
      productName: "Produto A",
      productSku: "SKU-1",
      productSupplierId: null,
      matchCriteria: "external_id",
    });
  });

  it("uses supplier product code only when the supplier matches", () => {
    const supplierCodeOnly = {
      ...model,
      items: [{ ...model.items[0], codeInternal: null, gtin: null, sku: null, name: "Unknown" }],
    };

    expect(matchPurchaseImport(supplierCodeOnly, catalog).items[0]).toMatchObject({
      productId: "supplier-code",
      productSupplierId: null,
      matchCriteria: "supplier_product_code",
    });
    expect(
      matchPurchaseImport(
        { ...supplierCodeOnly, supplier: { document: null, name: null } },
        catalog,
      ).items[0],
    ).toMatchObject({ productId: null, matchCriteria: null });
  });

  it("does not auto-link an ambiguous normalized name", () => {
    const nameOnly = {
      ...model,
      items: [{
        ...model.items[0],
        codeInternal: null,
        gtin: null,
        supplierProductCode: null,
        sku: null,
        name: "produto   a",
      }],
    };
    const ambiguousCatalog: MatchCatalog = {
      ...catalog,
      products: [
        { id: "one", external_id: null, gtin: null, sku: null, name: "Produto A" },
        { id: "two", external_id: null, gtin: null, sku: null, name: "  PRODUTO A " },
      ],
    };

    expect(matchPurchaseImport(nameOnly, ambiguousCatalog).items[0]).toMatchObject({
      productId: null,
      matchCriteria: null,
    });
  });

  it("ignores SEM GTIN marker on catalog products for gtin matching", () => {
    const gtinOnly = {
      ...model,
      items: [{
        ...model.items[0],
        codeInternal: null,
        gtin: "7899999999999",
        supplierProductCode: null,
        sku: null,
        name: "Unknown",
      }],
    };
    const markedCatalog: MatchCatalog = {
      ...catalog,
      products: [
        { id: "marked", external_id: "x", gtin: "SEM GTIN", sku: null, name: "Sem EAN" },
        { id: "real", external_id: "y", gtin: "7899999999999", sku: null, name: "Com EAN" },
      ],
      productSuppliers: [],
    };

    expect(matchPurchaseImport(gtinOnly, markedCatalog).items[0]).toMatchObject({
      productId: "real",
      matchCriteria: "gtin",
    });
  });
});
