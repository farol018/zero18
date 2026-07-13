import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FarolItem, EffectiveStatus } from "./useFarolInteligencia";

export type PeriodOption = "7" | "15" | "30" | "custom";

export interface PeriodConfig {
  option: PeriodOption;
  startDate: Date;
  endDate: Date;
  days: number;
}

export function buildPeriodConfig(
  option: PeriodOption,
  customStart?: Date,
  customEnd?: Date
): PeriodConfig {
  const now = new Date();
  const endDate = option === "custom" && customEnd ? customEnd : now;

  if (option === "custom" && customStart) {
    const diffMs = endDate.getTime() - customStart.getTime();
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return { option, startDate: customStart, endDate, days };
  }

  const numDays = parseInt(option) || 7;
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - numDays);
  return { option, startDate, endDate: now, days: numDays };
}

function deriveStatus(estoque: number, consumo: number, dias: number | null): EffectiveStatus {
  if (estoque < 0) return "anomaly";
  if (estoque === 0 && consumo === 0) return "neutral";
  if (dias === null || dias <= 0) return "ruptura";
  if (dias > 0 && dias <= 3) return "risco";
  return "green";
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

export function useFarolDynamic(period: PeriodConfig) {
  return useQuery({
    queryKey: ["farol_dynamic", period.option, period.days, period.startDate.toISOString(), period.endDate.toISOString()],
    queryFn: async () => {
      // 1. Find the most recent movement date to use as reference instead of NOW
      const { data: latestRow, error: latestErr } = await supabase
        .from("inventory_movements")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (latestErr && latestErr.code !== "PGRST116") throw latestErr;

      const latestDate = latestRow?.created_at
        ? new Date(latestRow.created_at)
        : new Date();

      // 2. Calculate effective period based on latest data date
      let effectiveEnd: Date;
      let effectiveStart: Date;

      if (period.option === "custom") {
        effectiveEnd = period.endDate;
        effectiveStart = period.startDate;
      } else {
        effectiveEnd = latestDate;
        effectiveStart = new Date(latestDate);
        effectiveStart.setDate(effectiveStart.getDate() - period.days);
      }

      const startISO = effectiveStart.toISOString();
      const endISO = effectiveEnd.toISOString();

      // 3. Get all products
      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, name");
      if (pErr) throw pErr;

      // 4. Get current stock (sum of all movements)
      const { data: allMovements, error: mErr } = await supabase
        .from("inventory_movements")
        .select("product_id, quantity");
      if (mErr) throw mErr;

      const stockMap = new Map<string, number>();
      for (const m of allMovements ?? []) {
        const cur = stockMap.get(m.product_id) ?? 0;
        stockMap.set(m.product_id, cur + (m.quantity ?? 0));
      }

      // 5. Get saida movements in the effective period
      const { data: saidaMovements, error: sErr } = await supabase
        .from("inventory_movements")
        .select("product_id, quantity, created_at")
        .eq("type", "saida")
        .gte("created_at", startISO)
        .lte("created_at", endISO);
      if (sErr) throw sErr;

      const consumoMap = new Map<string, { total: number; days: Set<string> }>();
      for (const m of saidaMovements ?? []) {
        const entry = consumoMap.get(m.product_id) ?? { total: 0, days: new Set() };
        entry.total += Math.abs(m.quantity ?? 0);
        if (m.created_at) {
          entry.days.add(m.created_at.substring(0, 10));
        }
        consumoMap.set(m.product_id, entry);
      }

      // 6. Build FarolItems using period.days as divisor for average
      const items: FarolItem[] = (products ?? []).map((p) => {
        const estoque = stockMap.get(p.id) ?? 0;
        const consumoEntry = consumoMap.get(p.id);

        const totalConsumo = consumoEntry ? consumoEntry.total : 0;
        const consumoMedioDia = totalConsumo > 0
          ? totalConsumo / period.days
          : 0;

        const diasEstoque = consumoMedioDia > 0
          ? estoque / consumoMedioDia
          : null;

        const sugestaoCompra = consumoMedioDia > 0
          ? Math.max(consumoMedioDia * 7 - estoque, 0)
          : 0;

        const effective_status = deriveStatus(estoque, consumoMedioDia, diasEstoque);

        return {
          product_id: p.id,
          product_name: p.name,
          estoque_atual: estoque,
          consumo_medio_dia: consumoMedioDia,
          dias_estoque: diasEstoque,
          status_estoque: effective_status,
          sugestao_compra: sugestaoCompra,
          alerta: estoque < 0 ? "negative" : null,
          effective_status,
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
