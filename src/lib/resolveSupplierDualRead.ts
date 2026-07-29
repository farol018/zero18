/**
 * FEATURE 004 — dual-read de fornecedor.
 * Prefere o vínculo primary ativo em product_suppliers; fallback para products.*.
 */
export type DualReadProduct = {
  supplier_id: string | null;
  purchase_multiple: number | null;
  cost_price: number | null;
};

export type DualReadPrimaryLink = {
  supplier_id: string;
  purchase_multiple: number | null;
  cost_price: number | null;
};

export type DualReadResolved = {
  supplier_id: string | null;
  purchase_multiple: number;
  cost_price: number | null;
};

export function resolveSupplierDualRead(
  product: DualReadProduct,
  primaryLink: DualReadPrimaryLink | null | undefined,
): DualReadResolved {
  return {
    supplier_id: primaryLink?.supplier_id ?? product.supplier_id ?? null,
    purchase_multiple: Number(
      primaryLink?.purchase_multiple ?? product.purchase_multiple ?? 1,
    ),
    cost_price:
      primaryLink?.cost_price != null
        ? Number(primaryLink.cost_price)
        : product.cost_price != null
          ? Number(product.cost_price)
          : null,
  };
}
