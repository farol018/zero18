import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FarolItem, EffectiveStatus } from "./useFarolInteligencia";

function mapStatusFarol(statusFarol: string | null, estoque: number): EffectiveStatus {
  if (estoque < 0) return "anomaly";
  if (!statusFarol) return "neutral";
  const s = statusFarol.toLowerCase();
  if (s.includes("ruptura")) return "ruptura";
  if (s.includes("risco")) return "risco";
  if (s.includes("atenção")) return "yellow";
  if (s.includes("saudável")) return "green";
  if (s.includes("sem consumo")) return "neutral";
  return "neutral";
}

function statusOrder(status: EffectiveStatus): number {
  switch (status) {
    case "anomaly": return -1;
    case "ruptura": return 0;
    case "risco": return 1;
    case "yellow": return 2;
    case "green": return 3;
    case "neutral": return 4;
  }
}

export function useFarolStockAnalysis() {
  return useQuery({
    queryKey: ["farol_stock_analysis"],
    queryFn: async () => {
      const [analysisRes, productsRes] = await Promise.all([
        supabase.from("stock_analysis").select("*"),
        supabase.from("products").select("id, external_id"),
      ]);
      if (analysisRes.error) throw analysisRes.error;
      if (productsRes.error) throw productsRes.error;

      const skuMap = new Map<string, string | null>();
      for (const p of productsRes.data ?? []) {
        skuMap.set(p.id, p.external_id);
      }

      const data = analysisRes.data;
      const items: FarolItem[] = (data ?? []).map((row) => {
        const estoque = row.estoque_atual ?? 0;
        const consumo = row.consumo_dia ?? 0;
        const dias = row.dias_cobertura;
        const effective_status = mapStatusFarol(row.status_farol, estoque);

        const sugestaoCompra = consumo > 0
          ? Math.max(consumo * 7 - estoque, 0)
          : 0;

        return {
          product_id: row.product_id,
          product_name: row.product_name ?? "Produto sem nome",
          estoque_atual: estoque,
          consumo_medio_dia: consumo,
          dias_estoque: dias,
          status_estoque: row.status_farol,
          sugestao_compra: row.quantidade_sugerida ?? sugestaoCompra,
          alerta: estoque < 0 ? "negative" : null,
          effective_status,
          purchase_multiple: row.purchase_multiple,
          cost_price: row.cost_price,
          external_id: row.product_id ? skuMap.get(row.product_id) ?? null : null,
        };
      });

      items.sort((a, b) => {
        const sa = statusOrder(a.effective_status);
        const sb = statusOrder(b.effective_status);
        if (sa !== sb) return sa - sb;
        return (b.sugestao_compra ?? 0) - (a.sugestao_compra ?? 0);
      });

      return items;
    },
  });
}
