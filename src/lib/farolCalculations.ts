export type EffectiveStatus = "ruptura" | "risco" | "yellow" | "green" | "neutral" | "anomaly";

export type FarolCalcInput = {
  estoque_atual: number;
  total_saida: number;
  window_days: number;
  coverage_days: number;
  purchase_multiple: number;
  /** Dias de lead time do fornecedor primary; null/undefined = 0 (comportamento legado). */
  lead_time_days?: number | null;
};

export type FarolCalcResult = {
  consumo_medio_dia: number;
  dias_estoque: number | null;
  status_farol: string;
  effective_status: EffectiveStatus;
  quantidade_sugerida: number;
};

export function mapStatusFarol(statusFarol: string | null, estoque: number): EffectiveStatus {
  if (estoque < 0) return "anomaly";
  if (!statusFarol) return "neutral";
  const s = statusFarol.toLowerCase();
  if (s.includes("anomalia")) return "anomaly";
  if (s.includes("ruptura")) return "ruptura";
  if (s.includes("risco")) return "risco";
  if (s.includes("atenção")) return "yellow";
  if (s.includes("saudável")) return "green";
  if (s.includes("sem consumo")) return "neutral";
  return "neutral";
}

export function calculateFarolMetrics(input: FarolCalcInput): FarolCalcResult {
  const estoque = input.estoque_atual ?? 0;
  const windowDays = Math.max(1, input.window_days);
  const leadTimeDays = Math.max(0, input.lead_time_days ?? 0);
  const coverageDays = Math.max(1, input.coverage_days) + leadTimeDays;
  const multiple = Math.max(1, input.purchase_multiple ?? 1);
  const totalSaida = Math.max(0, input.total_saida ?? 0);
  const consumoDia = totalSaida > 0 ? totalSaida / windowDays : 0;

  let diasEstoque: number | null = null;
  if (consumoDia > 0) {
    diasEstoque = estoque / consumoDia;
  }

  let statusFarol: string;
  if (estoque < 0) {
    statusFarol = "⚠️ anomalia";
  } else if (estoque === 0 && totalSaida > 0) {
    statusFarol = "🔴 ruptura";
  } else if (totalSaida === 0) {
    statusFarol = "⚪ sem consumo";
  } else if (diasEstoque !== null && diasEstoque <= 2) {
    statusFarol = "🔴 risco";
  } else if (diasEstoque !== null && diasEstoque <= 5) {
    statusFarol = "🟡 atenção";
  } else {
    statusFarol = "🟢 saudável";
  }

  let quantidadeBruta = 0;
  if (totalSaida > 0) {
    if (estoque < 0) {
      // Cobre o buraco + cobertura alvo (ex.: -131 + 7*consumo)
      quantidadeBruta = coverageDays * consumoDia + Math.abs(estoque);
    } else if (estoque === 0) {
      quantidadeBruta = coverageDays * consumoDia;
    } else if (diasEstoque !== null && diasEstoque >= coverageDays) {
      quantidadeBruta = 0;
    } else if (diasEstoque !== null) {
      quantidadeBruta = (coverageDays - diasEstoque) * consumoDia;
    }
  }

  const quantidadeSugerida =
    quantidadeBruta > 0
      ? Math.ceil(quantidadeBruta / multiple) * multiple
      : 0;

  return {
    consumo_medio_dia: consumoDia,
    dias_estoque: diasEstoque,
    status_farol: statusFarol,
    effective_status: mapStatusFarol(statusFarol, estoque),
    quantidade_sugerida: quantidadeSugerida,
  };
}

export function statusOrder(status: EffectiveStatus): number {
  switch (status) {
    case "anomaly":
      return -1;
    case "ruptura":
      return 0;
    case "risco":
      return 1;
    case "yellow":
      return 2;
    case "green":
      return 3;
    case "neutral":
      return 4;
  }
}

export function statusPriority(status: string | null): number {
  const s = (status ?? "").toLowerCase();
  if (s.includes("ruptura")) return 0;
  if (s.includes("risco")) return 1;
  if (s.includes("atenção")) return 2;
  return 3;
}
