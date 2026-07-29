import { describe, it, expect } from "vitest";
import { calculateFarolMetrics } from "@/lib/farolCalculations";

describe("calculateFarolMetrics", () => {
  it("calcula consumo médio diário pela janela", () => {
    const result = calculateFarolMetrics({
      estoque_atual: 50,
      total_saida: 70,
      window_days: 7,
      coverage_days: 7,
      purchase_multiple: 1,
    });
    expect(result.consumo_medio_dia).toBe(10);
    expect(result.dias_estoque).toBe(5);
    expect(result.effective_status).toBe("yellow");
  });

  it("sugere compra para atingir cobertura alvo", () => {
    const result = calculateFarolMetrics({
      estoque_atual: 20,
      total_saida: 70,
      window_days: 7,
      coverage_days: 7,
      purchase_multiple: 1,
    });
    expect(result.quantidade_sugerida).toBe(50);
  });

  it("arredonda sugestão ao múltiplo de compra", () => {
    const result = calculateFarolMetrics({
      estoque_atual: 0,
      total_saida: 70,
      window_days: 7,
      coverage_days: 7,
      purchase_multiple: 12,
    });
    expect(result.quantidade_sugerida).toBe(72);
    expect(result.effective_status).toBe("ruptura");
  });

  it("retorna zero quando estoque já cobre o período", () => {
    const result = calculateFarolMetrics({
      estoque_atual: 100,
      total_saida: 70,
      window_days: 7,
      coverage_days: 7,
      purchase_multiple: 1,
    });
    expect(result.quantidade_sugerida).toBe(0);
    expect(result.effective_status).toBe("green");
  });

  it("em estoque negativo inclui o déficit na sugestão", () => {
    const result = calculateFarolMetrics({
      estoque_atual: -131,
      total_saida: 1,
      window_days: 7,
      coverage_days: 7,
      purchase_multiple: 1,
    });
    // consumo_dia = 1/7; cobertura 7*1/7 = 1; +131 déficit = 132
    expect(result.consumo_medio_dia).toBeCloseTo(1 / 7);
    expect(result.quantidade_sugerida).toBe(132);
    expect(result.effective_status).toBe("anomaly");
  });

  it("FEATURE 005: lead_time aumenta a cobertura alvo da sugestão", () => {
    const withoutLead = calculateFarolMetrics({
      estoque_atual: 0,
      total_saida: 70,
      window_days: 7,
      coverage_days: 7,
      purchase_multiple: 1,
    });
    const withLead = calculateFarolMetrics({
      estoque_atual: 0,
      total_saida: 70,
      window_days: 7,
      coverage_days: 7,
      purchase_multiple: 1,
      lead_time_days: 3,
    });
    // consumo 10/dia; cobertura 7 → 70; cobertura 10 → 100
    expect(withoutLead.quantidade_sugerida).toBe(70);
    expect(withLead.quantidade_sugerida).toBe(100);
  });

  it("FEATURE 005: lead_time null mantém comportamento legado", () => {
    const result = calculateFarolMetrics({
      estoque_atual: 0,
      total_saida: 70,
      window_days: 7,
      coverage_days: 7,
      purchase_multiple: 1,
      lead_time_days: null,
    });
    expect(result.quantidade_sugerida).toBe(70);
  });
});
