// src/lib/purchaseOpsKpis.ts
export type PurchaseOpsWindowKpis = {
  confirmed_count: number;
  confirmed_amount: number;
  cancelled_count: number;
  confirmed_vs_draft_pct: number | null;
};

export type PurchaseOpsDraftsOpen = {
  total: number;
  total_amount: number;
  bling: number;
  farol: number;
  other: number;
};

export type PurchaseOpsTopSupplier = {
  supplier_id: string;
  name: string;
  amount: number;
  count: number;
};

export type PurchaseOpsKpis = {
  windows: { d14: PurchaseOpsWindowKpis; d30: PurchaseOpsWindowKpis };
  drafts_open: PurchaseOpsDraftsOpen;
  top_suppliers_d30: PurchaseOpsTopSupplier[];
};

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseWindow(w: unknown): PurchaseOpsWindowKpis {
  if (!w || typeof w !== "object") throw new Error("window inválida");
  const o = w as Record<string, unknown>;
  return {
    confirmed_count: num(o.confirmed_count),
    confirmed_amount: num(o.confirmed_amount),
    cancelled_count: num(o.cancelled_count),
    confirmed_vs_draft_pct: numOrNull(o.confirmed_vs_draft_pct),
  };
}

export function parsePurchaseOpsKpis(raw: unknown): PurchaseOpsKpis {
  if (!raw || typeof raw !== "object") throw new Error("KPI inválido");
  const o = raw as Record<string, unknown>;
  const windows = o.windows as Record<string, unknown> | undefined;
  if (!windows?.d14 || !windows?.d30) throw new Error("windows ausentes");
  const drafts = o.drafts_open as Record<string, unknown> | undefined;
  if (!drafts) throw new Error("drafts_open ausente");
  const top = Array.isArray(o.top_suppliers_d30) ? o.top_suppliers_d30 : [];
  return {
    windows: { d14: parseWindow(windows.d14), d30: parseWindow(windows.d30) },
    drafts_open: {
      total: num(drafts.total),
      total_amount: num(drafts.total_amount),
      bling: num(drafts.bling),
      farol: num(drafts.farol),
      other: num(drafts.other),
    },
    top_suppliers_d30: top.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        supplier_id: String(r.supplier_id ?? ""),
        name: String(r.name ?? "Sem nome"),
        amount: num(r.amount),
        count: num(r.count),
      };
    }),
  };
}

export function formatConfirmedVsDraftPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  return `${Math.round(pct)}%`;
}

/** Ticket médio = confirmed_amount / confirmed_count; null se count ≤ 0. */
export function averageTicket(amount: number, count: number): number | null {
  if (count <= 0) return null;
  const n = amount / count;
  return Number.isFinite(n) ? n : null;
}

/** Participação = amount / totalConfirmed30d × 100; null se total ≤ 0. */
export function supplierSharePct(amount: number, totalConfirmed30d: number): number | null {
  if (totalConfirmed30d <= 0) return null;
  const n = (amount / totalConfirmed30d) * 100;
  return Number.isFinite(n) ? n : null;
}

export function formatSharePct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  return `${Math.round(pct)}%`;
}
