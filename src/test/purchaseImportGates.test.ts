import { describe, expect, it } from "vitest";
import {
  assertImportReady,
  getImportReadiness,
} from "@/lib/purchaseImport/assertImportReady";

describe("getImportReadiness", () => {
  it("reports a missing supplier", () => {
    expect(getImportReadiness({ supplierId: null, items: [{ productId: "product-1" }] })).toEqual({
      ready: false,
      missingSupplier: true,
      unboundProductCount: 0,
      message: "Selecione o fornecedor.",
    });
  });

  it("reports the count of unbound products", () => {
    expect(
      getImportReadiness({
        supplierId: "supplier-1",
        items: [{ productId: null }, { productId: undefined }, { productId: "product-1" }],
      }),
    ).toEqual({
      ready: false,
      missingSupplier: false,
      unboundProductCount: 2,
      message: "Vincule 2 produtos ainda sem correspondência.",
    });
  });

  it("reports both import pendencies together", () => {
    expect(
      getImportReadiness({
        supplierId: "",
        items: [{ productId: null }, { productId: "product-1" }],
      }),
    ).toEqual({
      ready: false,
      missingSupplier: true,
      unboundProductCount: 1,
      message: "Selecione o fornecedor e vincule 1 produto ainda sem correspondência.",
    });
  });

  it("is ready when every import line is bound and a supplier is selected", () => {
    expect(
      getImportReadiness({
        supplierId: "supplier-1",
        items: [{ productId: "product-1" }, { productId: "product-2" }],
      }),
    ).toEqual({
      ready: true,
      missingSupplier: false,
      unboundProductCount: 0,
      message: null,
    });
  });
});

describe("assertImportReady", () => {
  it("throws the same friendly pending message when import is not ready", () => {
    expect(() =>
      assertImportReady({
        supplierId: null,
        items: [{ productId: null }, { productId: "product-1" }],
      }),
    ).toThrow("Selecione o fornecedor e vincule 1 produto ainda sem correspondência.");
  });
});
