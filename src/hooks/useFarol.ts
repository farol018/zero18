import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import {
  mapStatusFarol,
  statusOrder,
  statusPriority,
  type EffectiveStatus,
} from "@/lib/farolCalculations";
import { resolveSupplierDualRead } from "@/lib/resolveSupplierDualRead";
import { fetchAllRows } from "@/lib/supabasePaginate";

export type ViewMode = "pedido" | "analise";

export type FarolItem = {
  product_id: string;
  product_name: string;
  estoque_atual: number;
  consumo_medio_dia: number;
  dias_estoque: number | null;
  status_estoque: string;
  sugestao_compra: number;
  alerta: string | null;
  effective_status: EffectiveStatus;
  purchase_multiple: number;
  cost_price: number | null;
  external_id: string | null;
  sku: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  category_id: string | null;
  category_name: string | null;
};

export type SupplierGroup = {
  supplier_id: string;
  supplier_name: string;
  items: FarolItem[];
  totalUnits: number;
};

type AnalysisRow = {
  product_id: string | null;
  product_name: string | null;
  estoque_atual: number | null;
  consumo_dia: number | null;
  dias_cobertura: number | null;
  status_farol: string | null;
  quantidade_sugerida: number | null;
  purchase_multiple: number | null;
  cost_price: number | null;
};

type ListaCompraRow = {
  product_id: string | null;
  product_name: string | null;
  estoque_atual: number | null;
  consumo_dia: number | null;
  dias_cobertura: number | null;
  status_farol: string | null;
  quantidade_sugerida: number | null;
};

type ProductMeta = {
  id: string;
  supplier_id: string | null;
  purchase_multiple: number | null;
  cost_price: number | null;
  external_id: string | null;
  sku: string | null;
  category_id: string | null;
  category_name: string | null;
};

async function fetchPrimaryLinksByProductIds(
  ids: string[],
): Promise<Map<string, { supplier_id: string; purchase_multiple: number | null; cost_price: number | null }>> {
  const unique = [...new Set(ids)];
  const map = new Map<
    string,
    { supplier_id: string; purchase_multiple: number | null; cost_price: number | null }
  >();
  if (unique.length === 0) return map;

  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("product_suppliers")
      .select("product_id, supplier_id, purchase_multiple, cost_price")
      .in("product_id", chunk)
      .eq("is_primary", true)
      .eq("is_active", true);

    if (error) throw error;
    for (const row of data ?? []) {
      map.set(row.product_id, {
        supplier_id: row.supplier_id,
        purchase_multiple: row.purchase_multiple,
        cost_price: row.cost_price,
      });
    }
  }

  return map;
}

async function fetchCategoriesByIds(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("categories")
      .select("id, name")
      .in("id", chunk);
    if (error) throw error;
    for (const c of data ?? []) map.set(c.id, c.name);
  }
  return map;
}

async function fetchProductsByIds(ids: string[]): Promise<ProductMeta[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];

  const chunkSize = 200;
  const all: ProductMeta[] = [];
  const primaryLinks = await fetchPrimaryLinksByProductIds(unique);
  const rawRows: Array<{
    id: string;
    supplier_id: string | null;
    purchase_multiple: number | null;
    cost_price: number | null;
    external_id: string | null;
    sku: string | null;
    category_id: string | null;
  }> = [];

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("products")
      .select("id, supplier_id, purchase_multiple, cost_price, external_id, sku, category_id")
      .in("id", chunk);

    if (error) throw error;
    rawRows.push(...(data ?? []));
  }

  const categoryMap = await fetchCategoriesByIds(
    rawRows.map((r) => r.category_id).filter(Boolean) as string[],
  );

  for (const row of rawRows) {
    const resolved = resolveSupplierDualRead(
      {
        supplier_id: row.supplier_id,
        purchase_multiple: row.purchase_multiple,
        cost_price: row.cost_price,
      },
      primaryLinks.get(row.id),
    );

    all.push({
      id: row.id,
      supplier_id: resolved.supplier_id,
      purchase_multiple: resolved.purchase_multiple,
      cost_price: resolved.cost_price,
      external_id: row.external_id,
      sku: row.sku,
      category_id: row.category_id,
      category_name: row.category_id
        ? categoryMap.get(row.category_id) ?? "Sem categoria"
        : null,
    });
  }

  return all;
}

/** Busca só os fornecedores usados (evita limite de 1000 do PostgREST com 2k+ contatos). */
async function fetchSuppliersByIds(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name")
      .in("id", chunk);

    if (error) throw error;
    for (const s of data ?? []) {
      map.set(s.id, s.name);
    }
  }

  return map;
}

function rowToItem(
  row: AnalysisRow | ListaCompraRow,
  meta?: ProductMeta,
  supplierName?: string | null,
): FarolItem {
  const estoque = Number(row.estoque_atual ?? 0);
  const purchaseMultiple = Number(row.purchase_multiple ?? meta?.purchase_multiple ?? 1);

  return {
    product_id: row.product_id!,
    product_name: row.product_name ?? "",
    estoque_atual: estoque,
    consumo_medio_dia: Number(row.consumo_dia ?? 0),
    dias_estoque: row.dias_cobertura != null ? Number(row.dias_cobertura) : null,
    status_estoque: row.status_farol ?? "",
    sugestao_compra: Number(row.quantidade_sugerida ?? 0),
    alerta: estoque < 0 ? "negative" : null,
    effective_status: mapStatusFarol(row.status_farol, estoque),
    purchase_multiple: purchaseMultiple,
    cost_price:
      row.cost_price != null
        ? Number(row.cost_price)
        : meta?.cost_price != null
          ? Number(meta.cost_price)
          : null,
    external_id: meta?.external_id ?? null,
    sku: meta?.sku ?? null,
    supplier_id: meta?.supplier_id ?? null,
    supplier_name: supplierName ?? "Sem fornecedor",
    category_id: meta?.category_id ?? null,
    category_name: meta?.category_name ?? null,
  };
}

function buildSummary(rows: { status_farol: string | null; estoque_atual: number | null }[]) {
  const summary = {
    ruptura: 0,
    risco: 0,
    yellow: 0,
    green: 0,
    neutral: 0,
    anomaly: 0,
  };

  for (const row of rows) {
    const key = mapStatusFarol(row.status_farol, Number(row.estoque_atual ?? 0));
    summary[key] += 1;
  }

  return summary;
}

function buildPurchaseGroups(
  lista: ListaCompraRow[],
  productMap: Map<string, ProductMeta>,
  supplierMap: Map<string, string>,
): SupplierGroup[] {
  const groupsMap = new Map<string, SupplierGroup>();

  for (const row of lista) {
    if (!row.product_id) continue;

    const meta = productMap.get(row.product_id);
    const supplierId = meta?.supplier_id ?? "sem-fornecedor";
    const supplierName = meta?.supplier_id
      ? supplierMap.get(meta.supplier_id) ?? "Sem fornecedor"
      : "Sem fornecedor";

    const item = rowToItem(row, meta, supplierName);

    if (!groupsMap.has(supplierId)) {
      groupsMap.set(supplierId, {
        supplier_id: supplierId,
        supplier_name: supplierName,
        items: [],
        totalUnits: 0,
      });
    }

    const group = groupsMap.get(supplierId)!;
    group.items.push(item);
    group.totalUnits += Math.round(item.sugestao_compra);
  }

  const purchaseGroups = Array.from(groupsMap.values()).sort((a, b) => {
    const aNone = a.supplier_id === "sem-fornecedor" || a.supplier_name === "Sem fornecedor";
    const bNone = b.supplier_id === "sem-fornecedor" || b.supplier_name === "Sem fornecedor";
    if (aNone !== bNone) return aNone ? 1 : -1;

    const aMin = Math.min(...a.items.map((item) => statusPriority(item.status_estoque)));
    const bMin = Math.min(...b.items.map((item) => statusPriority(item.status_estoque)));
    if (aMin !== bMin) return aMin - bMin;

    return a.supplier_name.localeCompare(b.supplier_name, "pt-BR");
  });

  for (const group of purchaseGroups) {
    group.items.sort(
      (a, b) => statusPriority(a.status_estoque) - statusPriority(b.status_estoque),
    );
  }

  return purchaseGroups;
}

export function useFarol(mode: ViewMode = "pedido") {
  const { companyId, consumptionWindowDays } = useCompany();

  return useQuery({
    queryKey: ["farol", companyId, consumptionWindowDays, mode],
    queryFn: async () => {
      if (!companyId) {
        throw new Error("Empresa não resolvida. Faça login novamente.");
      }

      if (mode === "pedido") {
        const [lista, summaryRows] = await Promise.all([
          fetchAllRows((from, to) =>
            supabase
              .from("farol_lista_compra")
              .select("*")
              .eq("company_id", companyId)
              .range(from, to),
          ),
          fetchAllRows((from, to) =>
            supabase
              .from("stock_analysis")
              .select("status_farol, estoque_atual")
              .eq("company_id", companyId)
              .range(from, to),
          ),
        ]);

        const productIds = lista.map((row) => row.product_id).filter(Boolean) as string[];
        const products = await fetchProductsByIds(productIds);
        const productMap = new Map(products.map((p) => [p.id, p]));
        const supplierMap = await fetchSuppliersByIds(
          products.map((p) => p.supplier_id).filter(Boolean) as string[],
        );

        const purchaseGroups = buildPurchaseGroups(lista, productMap, supplierMap);
        const summary = buildSummary(summaryRows);

        return {
          items: [] as FarolItem[],
          purchaseGroups,
          summary,
          periodLabel: `${consumptionWindowDays} dias`,
          hasData: summaryRows.length > 0,
        };
      }

      const analysisRows = await fetchAllRows((from, to) =>
        supabase
          .from("stock_analysis")
          .select(
            "product_id, product_name, estoque_atual, consumo_dia, dias_cobertura, status_farol, quantidade_sugerida, purchase_multiple, cost_price",
          )
          .eq("company_id", companyId)
          .order("product_name")
          .range(from, to),
      );

      const analysisProductIds = analysisRows
        .map((row) => row.product_id)
        .filter(Boolean) as string[];
      const analysisProducts = await fetchProductsByIds(analysisProductIds);
      const analysisProductMap = new Map(analysisProducts.map((p) => [p.id, p]));
      const supplierMap = await fetchSuppliersByIds(
        analysisProducts.map((p) => p.supplier_id).filter(Boolean) as string[],
      );

      const items: FarolItem[] = analysisRows
        .filter((row) => row.product_id)
        .map((row) => {
          const meta = analysisProductMap.get(row.product_id!);
          const supplierName = meta?.supplier_id
            ? supplierMap.get(meta.supplier_id) ?? "Sem fornecedor"
            : "Sem fornecedor";
          return rowToItem(row, meta, supplierName);
        });

      items.sort((a, b) => {
        const sa = statusOrder(a.effective_status);
        const sb = statusOrder(b.effective_status);
        if (sa !== sb) return sa - sb;
        return b.sugestao_compra - a.sugestao_compra;
      });

      const purchaseGroups = buildPurchaseGroups(
        analysisRows.filter((row) => Number(row.quantidade_sugerida ?? 0) > 0),
        analysisProductMap,
        supplierMap,
      );

      return {
        items,
        purchaseGroups,
        summary: buildSummary(analysisRows),
        periodLabel: `${consumptionWindowDays} dias`,
        hasData: items.length > 0,
      };
    },
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
}
