import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PurchaseStatus = "ruptura" | "risco" | "atencao" | "outro";

export type PurchaseItem = {
  product_id: string | null;
  product_name: string | null;
  estoque_atual: number | null;
  consumo_dia: number | null;
  dias_cobertura: number | null;
  quantidade_sugerida: number | null;
  status_farol: string | null;
  prioridade: number | null;
  status: PurchaseStatus;
};

function mapStatus(statusFarol: string | null): PurchaseStatus {
  if (!statusFarol) return "outro";
  const s = statusFarol.toLowerCase();
  if (s.includes("ruptura")) return "ruptura";
  if (s.includes("risco")) return "risco";
  if (s.includes("atenção")) return "atencao";
  return "outro";
}

export function useFarolListaCompra() {
  return useQuery({
    queryKey: ["farol_lista_compra"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("farol_lista_compra")
        .select("*");
      if (error) throw error;

      const items: PurchaseItem[] = (data ?? []).map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name ?? "Produto sem nome",
        estoque_atual: row.estoque_atual,
        consumo_dia: row.consumo_dia,
        dias_cobertura: row.dias_cobertura,
        quantidade_sugerida: row.quantidade_sugerida,
        status_farol: row.status_farol,
        prioridade: row.prioridade,
        status: mapStatus(row.status_farol),
      }));

      // Sort by prioridade (already from backend), then by status
      items.sort((a, b) => (a.prioridade ?? 99) - (b.prioridade ?? 99));

      return items;
    },
  });
}
