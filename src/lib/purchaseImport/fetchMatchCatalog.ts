import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchCatalog } from "./matchPurchaseImport";
import {
  normalizeDigits,
  type PurchaseImportModel,
} from "./purchaseImportModel";

const IN_CHUNK = 100;

function uniqueCodes(values: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) out.add(trimmed);
  }
  return Array.from(out);
}

function chunk<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const parts: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    parts.push(values.slice(i, i + size));
  }
  return parts;
}

/**
 * Loads only the catalog rows needed to match an NFe import.
 * Avoids PostgREST's default 1000-row cap that truncates full-table selects
 * (tens of thousands of suppliers / products).
 */
export async function fetchMatchCatalogForImport(
  client: SupabaseClient,
  companyId: string,
  model: PurchaseImportModel,
): Promise<MatchCatalog> {
  const document = normalizeDigits(model.supplier.document);
  const gtins = uniqueCodes(model.items.map((item) => item.gtin));
  const skus = uniqueCodes(
    model.items.flatMap((item) => [item.sku, item.supplierProductCode, item.codeInternal]),
  );

  const suppliers: MatchCatalog["suppliers"] = [];
  if (document) {
    const { data, error } = await client
      .from("suppliers")
      .select("id, document, name")
      .eq("company_id", companyId)
      .eq("document", document);
    if (error) throw error;
    for (const row of data ?? []) {
      suppliers.push({ id: row.id, document: row.document, name: row.name });
    }
  }

  const productsById = new Map<string, MatchCatalog["products"][number]>();

  const rememberProduct = (row: {
    id: string;
    external_id: string | null;
    gtin: string | null;
    sku: string | null;
    name: string;
  }) => {
    productsById.set(row.id, {
      id: row.id,
      external_id: row.external_id,
      gtin: row.gtin,
      sku: row.sku,
      name: row.name,
    });
  };

  for (const gtinChunk of chunk(gtins, IN_CHUNK)) {
    const { data, error } = await client
      .from("products")
      .select("id, external_id, gtin, sku, name")
      .eq("company_id", companyId)
      .in("gtin", gtinChunk);
    if (error) throw error;
    for (const row of data ?? []) rememberProduct(row);
  }

  for (const skuChunk of chunk(skus, IN_CHUNK)) {
    const { data, error } = await client
      .from("products")
      .select("id, external_id, gtin, sku, name")
      .eq("company_id", companyId)
      .in("sku", skuChunk);
    if (error) throw error;
    for (const row of data ?? []) rememberProduct(row);
  }

  for (const externalChunk of chunk(skus, IN_CHUNK)) {
    const { data, error } = await client
      .from("products")
      .select("id, external_id, gtin, sku, name")
      .eq("company_id", companyId)
      .in("external_id", externalChunk);
    if (error) throw error;
    for (const row of data ?? []) rememberProduct(row);
  }

  const supplierId = suppliers.length === 1 ? suppliers[0].id : null;
  const supplierCodes = uniqueCodes(model.items.map((item) => item.supplierProductCode));
  const productSuppliers: MatchCatalog["productSuppliers"] = [];

  if (supplierId && supplierCodes.length > 0) {
    for (const codeChunk of chunk(supplierCodes, IN_CHUNK)) {
      const { data, error } = await client
        .from("product_suppliers")
        .select("product_id, supplier_id, supplier_sku")
        .eq("company_id", companyId)
        .eq("supplier_id", supplierId)
        .in("supplier_sku", codeChunk);
      if (error) throw error;
      for (const row of data ?? []) {
        productSuppliers.push({
          product_id: row.product_id,
          supplier_id: row.supplier_id,
          supplier_sku: row.supplier_sku,
        });
      }
    }

    const missingProductIds = productSuppliers
      .map((relation) => relation.product_id)
      .filter((id) => !productsById.has(id));

    for (const idChunk of chunk(missingProductIds, IN_CHUNK)) {
      const { data, error } = await client
        .from("products")
        .select("id, external_id, gtin, sku, name")
        .eq("company_id", companyId)
        .in("id", idChunk);
      if (error) throw error;
      for (const row of data ?? []) rememberProduct(row);
    }
  }

  return {
    suppliers,
    products: Array.from(productsById.values()),
    productSuppliers,
  };
}
