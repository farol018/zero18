import type { FarolItem, SupplierGroup } from "@/hooks/useFarol";
import { statusPriority } from "@/lib/farolCalculations";

export type PurchaseSortMode = "priority" | "category" | "supplier" | "value";

export type SupplierBucket = {
  supplier_id: string;
  supplier_name: string;
  items: FarolItem[];
  itemCount: number;
  totalUnits: number;
  totalBoxes: number;
  totalValue: number;
};

export type CategoryBucket = {
  category_id: string;
  category_name: string;
  suppliers: SupplierBucket[];
  itemCount: number;
  totalUnits: number;
  totalBoxes: number;
  totalValue: number;
  minPriority: number;
};

export type PurchaseListTotals = {
  itemCount: number;
  totalUnits: number;
  totalBoxes: number;
  totalValue: number;
  categoryCount: number;
  supplierCount: number;
};

export function itemPurchaseMetrics(item: FarolItem) {
  const qty = Math.round(item.sugestao_compra ?? 0);
  const mult = Math.max(1, item.purchase_multiple ?? 1);
  const boxes = mult > 1 ? Math.ceil(qty / mult) : 0;
  const value =
    item.cost_price != null && Number.isFinite(item.cost_price)
      ? qty * Number(item.cost_price)
      : 0;
  return { qty, mult, boxes, value };
}

function summarizeItems(items: FarolItem[]) {
  let totalUnits = 0;
  let totalBoxes = 0;
  let totalValue = 0;
  for (const item of items) {
    const m = itemPurchaseMetrics(item);
    totalUnits += m.qty;
    totalBoxes += m.boxes;
    totalValue += m.value;
  }
  return {
    itemCount: items.length,
    totalUnits,
    totalBoxes,
    totalValue,
  };
}

function buildSupplierBucket(supplierId: string, supplierName: string, items: FarolItem[]): SupplierGroup & SupplierBucket {
  const stats = summarizeItems(items);
  return {
    supplier_id: supplierId,
    supplier_name: supplierName,
    items,
    totalUnits: stats.totalUnits,
    itemCount: stats.itemCount,
    totalBoxes: stats.totalBoxes,
    totalValue: stats.totalValue,
  };
}

/** FEATURE 008: agrupa lista por categoria → fornecedor, com ordenação operacional. */
export function buildPurchaseListHierarchy(
  items: FarolItem[],
  sortMode: PurchaseSortMode = "priority",
): { categories: CategoryBucket[]; totals: PurchaseListTotals } {
  const byCategory = new Map<string, FarolItem[]>();

  for (const item of items) {
    const key = item.category_id ?? "sem-categoria";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(item);
  }

  const categories: CategoryBucket[] = [];

  for (const [categoryId, catItems] of byCategory) {
    const categoryName =
      categoryId === "sem-categoria"
        ? "Sem categoria"
        : catItems[0]?.category_name ?? "Sem categoria";

    const bySupplier = new Map<string, FarolItem[]>();
    for (const item of catItems) {
      const sid = item.supplier_id ?? "sem-fornecedor";
      if (!bySupplier.has(sid)) bySupplier.set(sid, []);
      bySupplier.get(sid)!.push(item);
    }

    const suppliers: SupplierBucket[] = [];
    for (const [supplierId, supplierItems] of bySupplier) {
      const supplierName =
        supplierId === "sem-fornecedor"
          ? "Sem fornecedor"
          : supplierItems[0]?.supplier_name ?? "Sem fornecedor";

      const sortedItems = [...supplierItems].sort((a, b) => {
        const pa = statusPriority(a.status_estoque);
        const pb = statusPriority(b.status_estoque);
        if (pa !== pb) return pa - pb;
        return (b.sugestao_compra ?? 0) - (a.sugestao_compra ?? 0);
      });

      suppliers.push(buildSupplierBucket(supplierId, supplierName, sortedItems));
    }

    suppliers.sort((a, b) => {
      if (sortMode === "supplier") {
        return a.supplier_name.localeCompare(b.supplier_name, "pt-BR");
      }
      if (sortMode === "value") {
        return b.totalValue - a.totalValue;
      }
      // priority (default) and category: urgency first
      const aMin = Math.min(...a.items.map((i) => statusPriority(i.status_estoque)));
      const bMin = Math.min(...b.items.map((i) => statusPriority(i.status_estoque)));
      if (aMin !== bMin) return aMin - bMin;
      return a.supplier_name.localeCompare(b.supplier_name, "pt-BR");
    });

    const stats = summarizeItems(catItems);
    categories.push({
      category_id: categoryId,
      category_name: categoryName,
      suppliers,
      itemCount: stats.itemCount,
      totalUnits: stats.totalUnits,
      totalBoxes: stats.totalBoxes,
      totalValue: stats.totalValue,
      minPriority: Math.min(...catItems.map((i) => statusPriority(i.status_estoque))),
    });
  }

  categories.sort((a, b) => {
    if (sortMode === "category") {
      const aNone = a.category_id === "sem-categoria";
      const bNone = b.category_id === "sem-categoria";
      if (aNone !== bNone) return aNone ? 1 : -1;
      return a.category_name.localeCompare(b.category_name, "pt-BR");
    }
    if (sortMode === "supplier") {
      return a.category_name.localeCompare(b.category_name, "pt-BR");
    }
    if (sortMode === "value") {
      return b.totalValue - a.totalValue;
    }
    // priority
    if (a.minPriority !== b.minPriority) return a.minPriority - b.minPriority;
    return b.totalValue - a.totalValue;
  });

  const flatSuppliers = new Set(
    categories.flatMap((c) => c.suppliers.map((s) => s.supplier_id)),
  );
  const allItems = items;
  const totalsStats = summarizeItems(allItems);

  return {
    categories,
    totals: {
      ...totalsStats,
      categoryCount: categories.length,
      supplierCount: flatSuppliers.size,
    },
  };
}

export function flattenPurchaseGroups(groups: SupplierGroup[]): FarolItem[] {
  return groups.flatMap((g) => g.items);
}
