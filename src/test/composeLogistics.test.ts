import { describe, expect, it } from "vitest";
import {
  composeLogistics,
  validateLogisticsLevels,
} from "@/lib/composeLogistics";

const levels = [
  { unit_name: "Caixa", base_units: 12, active: true, level_order: 1 },
  { unit_name: "Fardo", base_units: 72, active: true, level_order: 2 },
  { unit_name: "Camada", base_units: 576, active: true, level_order: 3 },
  { unit_name: "Pallet", base_units: 5760, active: true, level_order: 4 },
];

describe("FEATURE 010 composeLogistics", () => {
  it("decompõe 237 em fardos, caixas e unidades", () => {
    const result = composeLogistics(237, levels);
    expect(result.parts).toEqual([
      { unit_name: "Fardo", quantity: 3, base_units: 72 },
      { unit_name: "Caixa", quantity: 1, base_units: 12 },
    ]);
    expect(result.remainderUnits).toBe(9);
    expect(result.label).toContain("3 Fardos");
    expect(result.label).toContain("1 Caixa");
    expect(result.label).toContain("9 unidades");
  });

  it("decompõe 6340 priorizando maior nível", () => {
    const result = composeLogistics(6340, levels);
    expect(result.parts[0]).toEqual({ unit_name: "Pallet", quantity: 1, base_units: 5760 });
    expect(result.parts[1]).toEqual({ unit_name: "Camada", quantity: 1, base_units: 576 });
    expect(result.remainderUnits).toBe(4);
  });

  it("sem configuração retorna só unidades", () => {
    const result = composeLogistics(237, []);
    expect(result.parts).toEqual([]);
    expect(result.remainderUnits).toBe(237);
    expect(result.label).toBe("237 unidades");
  });

  it("ignora níveis inativos e ordena por base_units DESC (não level_order)", () => {
    const mixed = [
      { unit_name: "Caixa", base_units: 12, active: true, level_order: 99 },
      { unit_name: "Fardo", base_units: 72, active: false, level_order: 1 },
    ];
    const result = composeLogistics(30, mixed);
    expect(result.parts).toEqual([{ unit_name: "Caixa", quantity: 2, base_units: 12 }]);
    expect(result.remainderUnits).toBe(6);
  });
});

describe("FEATURE 010 validateLogisticsLevels", () => {
  it("rejeita nome Unidade", () => {
    const r = validateLogisticsLevels([{ unit_name: "Unidade", base_units: 1, active: true }]);
    expect(r.ok).toBe(false);
  });

  it("rejeita base_units duplicados", () => {
    const r = validateLogisticsLevels([
      { unit_name: "Caixa", base_units: 12, active: true },
      { unit_name: "Pack", base_units: 12, active: true },
    ]);
    expect(r.ok).toBe(false);
  });

  it("aceita níveis válidos crescentes", () => {
    const r = validateLogisticsLevels(levels);
    expect(r.ok).toBe(true);
  });
});
