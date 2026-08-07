export type FarolPurchaseSeedItem = {
  product_id: string;
  productName: string | null;
  productSku: string | null;
  quantity: number;
  unit_cost: number;
};

export type FarolPurchaseSeed = {
  supplierId: string;
  supplierName: string;
  issuedAt: string;
  source: "farol";
  items: FarolPurchaseSeedItem[];
  skippedNoCost: number;
  skippedNonPositiveQty: number;
};

type FarolLike = {
  product_id: string;
  product_name?: string | null;
  sku?: string | null;
  sugestao_compra?: number | null;
  cost_price?: number | null;
};

export function buildFarolPurchaseSeed(input: {
  supplierId: string;
  supplierName: string;
  items: FarolLike[];
  issuedAt: string;
}): { ok: true; seed: FarolPurchaseSeed } | { ok: false; reason: "no_eligible_items" } {
  let skippedNoCost = 0;
  let skippedNonPositiveQty = 0;
  const items: FarolPurchaseSeedItem[] = [];

  for (const it of input.items) {
    const quantity = Math.round(Number(it.sugestao_compra ?? 0));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      skippedNonPositiveQty += 1;
      continue;
    }
    const cost = it.cost_price;
    if (cost == null || !Number.isFinite(Number(cost))) {
      skippedNoCost += 1;
      continue;
    }
    items.push({
      product_id: it.product_id,
      productName: it.product_name ?? null,
      productSku: it.sku ?? null,
      quantity,
      unit_cost: Number(cost),
    });
  }

  if (items.length === 0) {
    return { ok: false, reason: "no_eligible_items" };
  }

  return {
    ok: true,
    seed: {
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      issuedAt: input.issuedAt,
      source: "farol",
      items,
      skippedNoCost,
      skippedNonPositiveQty,
    },
  };
}
