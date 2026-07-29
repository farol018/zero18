import {
  normalizeDigits,
  normalizeName,
  type PurchaseImportModel,
} from "./purchaseImportModel";

export type MatchCatalog = {
  suppliers: Array<{ id: string; document: string | null; name: string | null }>;
  products: Array<{
    id: string;
    external_id: string | null;
    gtin: string | null;
    sku: string | null;
    name: string;
  }>;
  productSuppliers: Array<{
    product_id: string;
    supplier_id: string;
    supplier_sku: string | null;
  }>;
};

export type ProductMatchCriteria =
  | "external_id"
  | "gtin"
  | "supplier_product_code"
  | "sku"
  | "name"
  | null;

export type MatchedPurchaseImport = {
  model: PurchaseImportModel;
  supplierId: string | null;
  supplierMatchCriteria: "document" | null;
  items: Array<{
    lineKey: string;
    productId: string | null;
    productSupplierId: string | null;
    quantity: number;
    unitCost: number;
    matchCriteria: ProductMatchCriteria;
  }>;
};

type Product = MatchCatalog["products"][number];

function normalizeCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleUpperCase("pt-BR") ?? "";
  return normalized || null;
}

function uniqueProduct(products: Product[]): Product | "ambiguous" | null {
  const distinct = Array.from(new Map(products.map((product) => [product.id, product])).values());
  if (distinct.length === 1) return distinct[0];
  return distinct.length > 1 ? "ambiguous" : null;
}

function findProduct(
  item: PurchaseImportModel["items"][number],
  catalog: MatchCatalog,
  supplierId: string | null,
): { product: Product; criteria: Exclude<ProductMatchCriteria, null> } | null {
  const criteria: Array<{
    name: Exclude<ProductMatchCriteria, null>;
    candidates: () => Product[];
  }> = [
    {
      name: "external_id",
      candidates: () => {
        const code = normalizeCode(item.codeInternal);
        return code
          ? catalog.products.filter((product) => normalizeCode(product.external_id) === code)
          : [];
      },
    },
    {
      name: "gtin",
      candidates: () => {
        const gtin = normalizeCode(item.gtin);
        return gtin
          ? catalog.products.filter((product) => normalizeCode(product.gtin) === gtin)
          : [];
      },
    },
    {
      name: "supplier_product_code",
      candidates: () => {
        const supplierProductCode = normalizeCode(item.supplierProductCode);
        if (!supplierId || !supplierProductCode) return [];
        const productIds = new Set(
          catalog.productSuppliers
            .filter(
              (relation) =>
                relation.supplier_id === supplierId &&
                normalizeCode(relation.supplier_sku) === supplierProductCode,
            )
            .map((relation) => relation.product_id),
        );
        return catalog.products.filter((product) => productIds.has(product.id));
      },
    },
    {
      name: "sku",
      candidates: () => {
        // products.sku ↔ SKU do model ou cProd (supplierProductCode)
        const codes = [normalizeCode(item.sku), normalizeCode(item.supplierProductCode)].filter(
          (code): code is string => Boolean(code),
        );
        if (codes.length === 0) return [];
        return catalog.products.filter((product) => {
          const productSku = normalizeCode(product.sku);
          return productSku != null && codes.includes(productSku);
        });
      },
    },
    {
      name: "name",
      candidates: () => {
        const name = normalizeName(item.name);
        return name
          ? catalog.products.filter((product) => normalizeName(product.name) === name)
          : [];
      },
    },
  ];

  for (const criterion of criteria) {
    const product = uniqueProduct(criterion.candidates());
    // Ambiguous criterion: do not auto-link on it; try next criteria.
    if (product === "ambiguous") continue;
    if (product) return { product, criteria: criterion.name };
  }

  return null;
}

export function matchPurchaseImport(
  model: PurchaseImportModel,
  catalog: MatchCatalog,
): MatchedPurchaseImport {
  const document = normalizeDigits(model.supplier.document);
  const supplierCandidates = document
    ? catalog.suppliers.filter((supplier) => normalizeDigits(supplier.document) === document)
    : [];
  const supplier = supplierCandidates.length === 1 ? supplierCandidates[0] : null;
  const supplierId = supplier?.id ?? null;

  return {
    model,
    supplierId,
    supplierMatchCriteria: supplier ? "document" : null,
    items: model.items.map((item) => {
      const match = findProduct(item, catalog, supplierId);
      return {
        lineKey: item.lineKey,
        productId: match?.product.id ?? null,
        productSupplierId: null,
        quantity: item.quantity,
        unitCost: item.unitCost,
        matchCriteria: match?.criteria ?? null,
      };
    }),
  };
}
