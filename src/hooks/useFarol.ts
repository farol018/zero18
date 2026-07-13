import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import {
  mapStatusFarol,
  statusOrder,
  statusPriority,
  type EffectiveStatus,
} from "@/lib/farolCalculations";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { buildPeriodConfig, type PeriodConfig, type PeriodOption } from "@/hooks/useFarolDynamic";

export type { PeriodOption, PeriodConfig };
export { buildPeriodConfig };

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
};

async function fetchProductsByIds(ids: string[]): Promise<ProductMeta[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];

  const chunkSize = 200;
  const all: ProductMeta[] = [];

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("products")
      .select("id, supplier_id, purchase_multiple, cost_price, external_id, sku")
      .in("id", chunk);

    if (error) throw error;
    all.push(...(data ?? []));
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

export function useFarol(period: PeriodConfig, mode: ViewMode = "pedido") {
  const { companyId, consumptionWindowDays } = useCompany();

  return useQuery({
    queryKey: [
      "farol",
      companyId,
      consumptionWindowDays,
      mode,
      period.option,
      period.days,
    ],
    queryFn: async () => {
      if (mode === "pedido") {
        const [listaRes, summaryRows] = await Promise.all([
          supabase.from("farol_lista_compra").select("*").eq("company_id", companyId),
          fetchAllRows((from, to) =>
            supabase
              .from("stock_analysis")
              .select("status_farol, estoque_atual")
              .eq("company_id", companyId)
              .range(from, to),
          ),
        ]);

        if (listaRes.error) throw listaRes.error;

        const lista = listaRes.data ?? [];
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
