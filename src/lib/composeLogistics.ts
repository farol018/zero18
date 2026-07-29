export type LogisticsLevel = {
  unit_name: string;
  base_units: number;
  active?: boolean;
  level_order?: number;
};

export type LogisticsPart = {
  unit_name: string;
  quantity: number;
  base_units: number;
};

export type LogisticsComposition = {
  parts: LogisticsPart[];
  remainderUnits: number;
  label: string;
};

const FORBIDDEN_UNIT_NAMES = new Set(["unidade", "unidades", "un", "un."]);

export function isForbiddenUnitName(name: string): boolean {
  return FORBIDDEN_UNIT_NAMES.has(name.trim().toLowerCase());
}

/** Valida níveis ativos: nomes, base_units > 0, únicos e estritamente crescentes. */
export function validateLogisticsLevels(
  levels: LogisticsLevel[],
): { ok: true } | { ok: false; error: string } {
  const active = levels.filter((l) => l.active !== false);
  const names = new Set<string>();
  const bases = new Set<number>();

  for (const level of active) {
    const name = (level.unit_name ?? "").trim();
    if (!name) return { ok: false, error: "Nome do nível é obrigatório." };
    if (isForbiddenUnitName(name)) {
      return { ok: false, error: 'Não use o nome "Unidade" — o resto é sempre "N unidades".' };
    }
    const key = name.toLowerCase();
    if (names.has(key)) return { ok: false, error: `Nome duplicado: ${name}.` };
    names.add(key);

    const bu = Number(level.base_units);
    if (!Number.isFinite(bu) || !Number.isInteger(bu) || bu <= 0) {
      return { ok: false, error: "base_units deve ser um inteiro > 0." };
    }
    if (bases.has(bu)) {
      return { ok: false, error: `base_units duplicado: ${bu}.` };
    }
    bases.add(bu);
  }

  const sorted = [...active].sort((a, b) => Number(a.base_units) - Number(b.base_units));
  for (let i = 1; i < sorted.length; i++) {
    if (Number(sorted[i].base_units) <= Number(sorted[i - 1].base_units)) {
      return { ok: false, error: "base_units dos níveis ativos devem ser estritamente crescentes." };
    }
  }

  return { ok: true };
}

function pluralizeUnit(name: string, qty: number): string {
  if (qty === 1) return name;
  const lower = name.toLowerCase();
  if (lower.endsWith("s")) return name;
  if (lower.endsWith("l") && !lower.endsWith("el")) return `${name}s`;
  if (lower === "caixa") return "Caixas";
  if (lower === "fardo") return "Fardos";
  if (lower === "camada") return "Camadas";
  if (lower === "pallet" || lower === "palete") return name.endsWith("t") ? `${name}s` : `${name}s`;
  return `${name}s`;
}

export function formatLogisticsLabel(parts: LogisticsPart[], remainderUnits: number): string {
  const chunks: string[] = [];
  for (const part of parts) {
    chunks.push(`${part.quantity} ${pluralizeUnit(part.unit_name, part.quantity)}`);
  }
  if (remainderUnits > 0 || chunks.length === 0) {
    const n = Math.max(0, Math.round(remainderUnits));
    chunks.push(`${n} ${n === 1 ? "unidade" : "unidades"}`);
  }
  return chunks.join(" · ");
}

/**
 * Transforma quantidade (já calculada pelo Farol) em composição logística.
 * Não altera abastecimento, estoque, compras nem custos.
 */
export function composeLogistics(
  quantity: number,
  levels: LogisticsLevel[],
): LogisticsComposition {
  const need = Math.max(0, Math.round(Number(quantity) || 0));

  const usable = levels
    .filter((l) => l.active !== false)
    .map((l) => ({
      unit_name: String(l.unit_name ?? "").trim(),
      base_units: Math.round(Number(l.base_units)),
    }))
    .filter(
      (l) =>
        l.unit_name &&
        !isForbiddenUnitName(l.unit_name) &&
        Number.isFinite(l.base_units) &&
        l.base_units > 0,
    )
    .sort((a, b) => b.base_units - a.base_units);

  if (usable.length === 0) {
    return {
      parts: [],
      remainderUnits: need,
      label: formatLogisticsLabel([], need),
    };
  }

  let remaining = need;
  const parts: LogisticsPart[] = [];

  for (const level of usable) {
    if (remaining < level.base_units) continue;
    const qty = Math.floor(remaining / level.base_units);
    if (qty <= 0) continue;
    parts.push({
      unit_name: level.unit_name,
      quantity: qty,
      base_units: level.base_units,
    });
    remaining -= qty * level.base_units;
  }

  return {
    parts,
    remainderUnits: remaining,
    label: formatLogisticsLabel(parts, remaining),
  };
}
