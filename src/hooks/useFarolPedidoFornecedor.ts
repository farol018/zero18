import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SupplierItem = {
  product_id: string | null;
  product_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  estoque_atual: number | null;
  consumo_dia: number | null;
  dias_cobertura: number | null;
  quantidade_sugerida: number | null;
  status_farol: string | null;
  purchase_multiple?: number | null;
  cost_price?: number | null;
  external_id?: string | null;
};

export type SupplierGroup = {
  supplier_id: string;
  supplier_name: string;
  items: SupplierItem[];
  totalUnits: number;
};

function statusPriority(status: string | null): number {
  const s = (status ?? "").toLowerCase();
  if (s.includes("ruptura")) return 0;
  if (s.includes("risco")) return 1;
  if (s.includes("atenção")) return 2;
  return 3;
}

export function useFarolPedidoFornecedor() {
  return useQuery({
    queryKey: ["farol_pedido_fornecedor"],
    queryFn: async () => {
      const [farolRes, analysisRes, productsRes] = await Promise.all([
        supabase.from("farol_pedido_fornecedor").select("*"),
        supabase.from("stock_analysis").select("product_id, purchase_multiple, cost_price"),
        supabase.from("products").select("id, external_id"),
      ]);
      if (farolRes.error) throw farolRes.error;
      if (analysisRes.error) throw analysisRes.error;
      if (productsRes.error) throw productsRes.error;

      const multipleMap = new Map<string, { mult: number; cost: number | null }>();
      for (const item of analysisRes.data ?? []) {
        if (item.product_id) {
          multipleMap.set(item.product_id, {
            mult: item.purchase_multiple ?? 1,
            cost: item.cost_price ?? null,
          });
        }
      }

      const skuMap = new Map<string, string | null>();
      for (const p of productsRes.data ?? []) {
        skuMap.set(p.id, p.external_id);
      }

      const items: SupplierItem[] = (farolRes.data ?? []).map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name ?? "Produto sem nome",
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name ?? "Sem fornecedor",
        estoque_atual: row.estoque_atual,
        consumo_dia: row.consumo_dia,
        dias_cobertura: row.dias_cobertura,
        quantidade_sugerida: row.quantidade_sugerida,
        status_farol: row.status_farol,
        purchase_multiple: row.product_id ? (multipleMap.get(row.product_id)?.mult ?? 1) : 1,
        cost_price: row.product_id ? (multipleMap.get(row.product_id)?.cost ?? null) : null,
        external_id: row.product_id ? (skuMap.get(row.product_id) ?? null) : null,
      }));

      // Sort items by status priority
      items.sort((a, b) => statusPriority(a.status_farol) - statusPriority(b.status_farol));

      // Group by supplier
      const map = new Map<string, SupplierGroup>();
      for (const item of items) {
        const key = item.supplier_id ?? "_none";
        if (!map.has(key)) {
          map.set(key, {
            supplier_id: key,
            supplier_name: item.supplier_name ?? "Sem fornecedor",
            items: [],
            totalUnits: 0,
          });
        }
        const group = map.get(key)!;
        group.items.push(item);
        group.totalUnits += Math.round(item.quantidade_sugerida ?? 0);
      }

      // Sort groups: those with urgent items first
      const groups = Array.from(map.values());
      groups.sort((a, b) => {
        const aMin = Math.min(...a.items.map(i => statusPriority(i.status_farol)));
        const bMin = Math.min(...b.items.map(i => statusPriority(i.status_farol)));
        return aMin - bMin;
      });

      return groups;
    },
  });
}
