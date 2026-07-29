import { describe, expect, it } from "vitest";
import { composeLogistics } from "@/lib/composeLogistics";
import { logisticsLabelFor } from "@/hooks/useProductLogistics";

/**
 * Integração leve: caminho Lista/Compras → label logística
 * (sem alterar sugestao_compra / quantidade).
 */
describe("FEATURE 010 logistics display integration", () => {
  const levels = [
    { unit_name: "Caixa", base_units: 12, active: true },
    { unit_name: "Fardo", base_units: 72, active: true },
  ];

  it("Lista: sugestao_compra 237 vira label logística sem mudar qty", () => {
    const sugestaoCompra = 237;
    const label = logisticsLabelFor(sugestaoCompra, levels);
    expect(sugestaoCompra).toBe(237);
    expect(label).toBe(composeLogistics(237, levels).label);
    expect(label).toMatch(/3 Fardos/);
    expect(label).toMatch(/1 Caixa/);
    expect(label).toMatch(/9 unidades/);
  });

  it("Compras: quantity de linha usa a mesma composição", () => {
    const purchaseQty = 100;
    const label = logisticsLabelFor(purchaseQty, levels);
    expect(label).toMatch(/1 Fardo/);
    expect(label).toMatch(/2 Caixas/);
    expect(label).toMatch(/4 unidades/);
  });
});
