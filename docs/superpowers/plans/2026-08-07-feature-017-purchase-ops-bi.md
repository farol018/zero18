# FEATURE 017 — BI operacional de compras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba **Gestão** com KPIs de compras via RPC `get_purchase_ops_kpis` (14/30d, drafts, top 5, cancelados, %), exatamente como a spec.

**Architecture:** PostgreSQL RPC agrega `purchases` (+ `suppliers.name`); hook TanStack Query; `GestaoView` só renderiza o payload. Spec: `docs/superpowers/specs/2026-08-07-feature-017-purchase-ops-bi-design.md`.

**Tech Stack:** React + Vite + TanStack Query + Supabase JS + Vitest + PostgreSQL RPC.

## Global Constraints

- **Escopo = SPEC, ponto final.** Não adicionar KPIs, gráficos, filtros, seletor de período, drill-down, navegação para Compras, export, telemetria marketplace, nem BI Farol. Qualquer evolução → **FEATURE 017.1**.
- Período **fixo** 14d e 30d (`issued_at` em `[CURRENT_DATE - (N-1), CURRENT_DATE]`).
- `%` = `confirmed / (confirmed + draft)` na janela; cancelados **fora** do denominador; denom 0 → `null`.
- Drafts abertos = snapshot **agora**; `other` = tudo que não é `bling` nem `farol`.
- Top 5 = confirmed **30d** por `sum(total_amount)`.
- Commits só se o usuário pedir; sem push salvo pedido.
- Não alterar sync n8n / `import_purchase_nfe` / motor Farol.

---

## File map

| Path | Responsabilidade |
|------|------------------|
| `src/lib/purchaseOpsKpis.ts` | Tipos + `parsePurchaseOpsKpis` (validação/normalização do JSON) |
| `src/test/purchaseOpsKpis.test.ts` | Testes do parser / % display helper |
| `supabase/migrations/20260807120000_feature_017_purchase_ops_kpis.sql` | RPC + GRANT |
| `src/hooks/usePurchaseOpsKpis.ts` | Query `rpc('get_purchase_ops_kpis')` |
| `src/components/gestao/GestaoView.tsx` | UI: entradas, drafts, top 5, estados |
| `src/pages/Index.tsx` | Tab Gestão + Atualizar |
| `README.md` | Linha FEATURE 017 |
| `docs/superpowers/specs/2026-08-07-feature-017-purchase-ops-bi-design.md` | Status → implementada (após aceite) |

---

### Task 1: Tipos + parser (TDD)

**Files:**
- Create: `src/lib/purchaseOpsKpis.ts`
- Create: `src/test/purchaseOpsKpis.test.ts`

**Interfaces:**
- Produces:
  - `PurchaseOpsWindowKpis`, `PurchaseOpsDraftsOpen`, `PurchaseOpsTopSupplier`, `PurchaseOpsKpis`
  - `parsePurchaseOpsKpis(raw: unknown): PurchaseOpsKpis` (lança se shape inválido)
  - `formatConfirmedVsDraftPct(pct: number | null): string` → `"—"` se null, senão `"12%"` (inteiro arredondado)

- [ ] **Step 1: Teste falhando**

```ts
import { describe, expect, it } from "vitest";
import {
  formatConfirmedVsDraftPct,
  parsePurchaseOpsKpis,
} from "@/lib/purchaseOpsKpis";

describe("parsePurchaseOpsKpis", () => {
  it("normaliza números e top suppliers", () => {
    const raw = {
      windows: {
        d14: {
          confirmed_count: "2",
          confirmed_amount: "100.5",
          cancelled_count: 1,
          confirmed_vs_draft_pct: 66.6,
        },
        d30: {
          confirmed_count: 0,
          confirmed_amount: 0,
          cancelled_count: 0,
          confirmed_vs_draft_pct: null,
        },
      },
      drafts_open: { total: 3, bling: 1, farol: 1, other: 1 },
      top_suppliers_d30: [
        {
          supplier_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          name: "ACME",
          amount: "50",
          count: "2",
        },
      ],
    };
    const k = parsePurchaseOpsKpis(raw);
    expect(k.windows.d14.confirmed_count).toBe(2);
    expect(k.windows.d14.confirmed_amount).toBe(100.5);
    expect(k.windows.d14.confirmed_vs_draft_pct).toBeCloseTo(66.6);
    expect(k.windows.d30.confirmed_vs_draft_pct).toBeNull();
    expect(k.drafts_open).toEqual({ total: 3, bling: 1, farol: 1, other: 1 });
    expect(k.top_suppliers_d30[0]).toEqual({
      supplier_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "ACME",
      amount: 50,
      count: 2,
    });
  });

  it("rejeita payload sem windows", () => {
    expect(() => parsePurchaseOpsKpis({})).toThrow();
  });
});

describe("formatConfirmedVsDraftPct", () => {
  it("formata null e número", () => {
    expect(formatConfirmedVsDraftPct(null)).toBe("—");
    expect(formatConfirmedVsDraftPct(66.6)).toBe("67%");
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `npm test -- src/test/purchaseOpsKpis.test.ts`  
Expected: FAIL (módulo/export ausente)

- [ ] **Step 3: Implementação mínima**

```ts
// src/lib/purchaseOpsKpis.ts
export type PurchaseOpsWindowKpis = {
  confirmed_count: number;
  confirmed_amount: number;
  cancelled_count: number;
  confirmed_vs_draft_pct: number | null;
};

export type PurchaseOpsDraftsOpen = {
  total: number;
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
```

- [ ] **Step 4: Rodar testes — PASS**

Run: `npm test -- src/test/purchaseOpsKpis.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit (só se usuário pedir)**

---

### Task 2: Migration RPC `get_purchase_ops_kpis`

**Files:**
- Create: `supabase/migrations/20260807120000_feature_017_purchase_ops_kpis.sql`

**Interfaces:**
- Consumes: `public.purchases`, `public.suppliers`, `public.profiles`
- Produces: `get_purchase_ops_kpis(uuid) → jsonb` (shape da spec); `GRANT EXECUTE` a `authenticated`

- [ ] **Step 1: Escrever migration completa**

```sql
-- FEATURE 017: purchase ops KPIs for Gestão tab

CREATE OR REPLACE FUNCTION public.get_purchase_ops_kpis(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_company uuid;
  v_today date := CURRENT_DATE;
  v_d14_start date := v_today - 13;
  v_d30_start date := v_today - 29;
  v_d14 jsonb;
  v_d30 jsonb;
  v_drafts jsonb;
  v_top jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required';
  END IF;

  SELECT company_id INTO v_profile_company
  FROM public.profiles
  WHERE id = v_uid;

  IF v_profile_company IS NULL OR v_profile_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH w AS (
    SELECT
      status,
      coalesce(total_amount, 0)::numeric AS amount
    FROM public.purchases
    WHERE company_id = p_company_id
      AND issued_at BETWEEN v_d14_start AND v_today
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_count,
      coalesce(sum(amount) FILTER (WHERE status = 'confirmed'), 0)::numeric AS confirmed_amount,
      count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
      count(*) FILTER (WHERE status = 'confirmed')::int AS c,
      count(*) FILTER (WHERE status = 'draft')::int AS d
    FROM w
  )
  SELECT jsonb_build_object(
    'confirmed_count', confirmed_count,
    'confirmed_amount', confirmed_amount,
    'cancelled_count', cancelled_count,
    'confirmed_vs_draft_pct',
      CASE WHEN (c + d) = 0 THEN NULL
           ELSE round((c::numeric / (c + d)::numeric) * 100, 2)
      END
  )
  INTO v_d14
  FROM agg;

  WITH w AS (
    SELECT
      status,
      coalesce(total_amount, 0)::numeric AS amount
    FROM public.purchases
    WHERE company_id = p_company_id
      AND issued_at BETWEEN v_d30_start AND v_today
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_count,
      coalesce(sum(amount) FILTER (WHERE status = 'confirmed'), 0)::numeric AS confirmed_amount,
      count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
      count(*) FILTER (WHERE status = 'confirmed')::int AS c,
      count(*) FILTER (WHERE status = 'draft')::int AS d
    FROM w
  )
  SELECT jsonb_build_object(
    'confirmed_count', confirmed_count,
    'confirmed_amount', confirmed_amount,
    'cancelled_count', cancelled_count,
    'confirmed_vs_draft_pct',
      CASE WHEN (c + d) = 0 THEN NULL
           ELSE round((c::numeric / (c + d)::numeric) * 100, 2)
      END
  )
  INTO v_d30
  FROM agg;

  SELECT jsonb_build_object(
    'total', count(*)::int,
    'bling', count(*) FILTER (WHERE source = 'bling')::int,
    'farol', count(*) FILTER (WHERE source = 'farol')::int,
    'other', count(*) FILTER (WHERE source IS DISTINCT FROM 'bling' AND source IS DISTINCT FROM 'farol')::int
  )
  INTO v_drafts
  FROM public.purchases
  WHERE company_id = p_company_id
    AND status = 'draft';

  SELECT coalesce(jsonb_agg(row_json ORDER BY amount DESC), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT jsonb_build_object(
      'supplier_id', p.supplier_id,
      'name', coalesce(s.name, 'Sem fornecedor'),
      'amount', sum(coalesce(p.total_amount, 0)),
      'count', count(*)::int
    ) AS row_json,
    sum(coalesce(p.total_amount, 0)) AS amount
    FROM public.purchases p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    WHERE p.company_id = p_company_id
      AND p.status = 'confirmed'
      AND p.issued_at BETWEEN v_d30_start AND v_today
    GROUP BY p.supplier_id, s.name
    ORDER BY sum(coalesce(p.total_amount, 0)) DESC
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'windows', jsonb_build_object('d14', v_d14, 'd30', v_d30),
    'drafts_open', v_drafts,
    'top_suppliers_d30', v_top
  );
END;
$$;

COMMENT ON FUNCTION public.get_purchase_ops_kpis(uuid) IS
  'FEATURE 017: KPIs de compras (14/30d, drafts, top 5) para aba Gestão';

REVOKE ALL ON FUNCTION public.get_purchase_ops_kpis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_purchase_ops_kpis(uuid) TO authenticated;
```

- [ ] **Step 2: Smoke SQL (usuário no Editor, após apply)**

```sql
SELECT public.get_purchase_ops_kpis('04c9b2c3-1c6e-439b-949a-486e4917b13c');
-- Como authenticated via app: deve retornar JSON; como service role sem profile → forbidden (ok).
```

Validar à mão: `confirmed_count` 30d ≈ lista Compras confirmadas com `issued_at` nos últimos 30 dias.

- [ ] **Step 3: Commit (só se usuário pedir)**

---

### Task 3: Hook `usePurchaseOpsKpis`

**Files:**
- Create: `src/hooks/usePurchaseOpsKpis.ts`

**Interfaces:**
- Consumes: `parsePurchaseOpsKpis`, `useCompany().companyId`, `supabase.rpc`
- Produces: `usePurchaseOpsKpis()` → TanStack Query com `data: PurchaseOpsKpis | undefined`

- [ ] **Step 1: Implementar hook**

```ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { parsePurchaseOpsKpis, type PurchaseOpsKpis } from "@/lib/purchaseOpsKpis";

export function usePurchaseOpsKpis() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["purchase-ops-kpis", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<PurchaseOpsKpis> => {
      const { data, error } = await supabase.rpc("get_purchase_ops_kpis", {
        p_company_id: companyId,
      });
      if (error) throw error;
      return parsePurchaseOpsKpis(data);
    },
  });
}
```

Nota: se `Database` types gerados reclamarem do nome do RPC, tipar o call como `supabase.rpc("get_purchase_ops_kpis" as never, …)` **só se necessário** — preferir cast mínimo; não regenerar types no MVP a menos que o build quebre.

- [ ] **Step 2: Commit (só se usuário pedir)**

---

### Task 4: `GestaoView` (UI estrita da spec)

**Files:**
- Create: `src/components/gestao/GestaoView.tsx`

**Interfaces:**
- Consumes: `usePurchaseOpsKpis`, `formatConfirmedVsDraftPct`
- Produces: UI com exatamente 3 blocos da spec + loading/vazio/erro

**UI rules (não expandir):**
1. Entradas — cards 14d e 30d: R$ + nº NFs; secundário cancelados + %
2. Drafts abertos — total + bling / farol / other
3. Top fornecedores (30d) — nome · R$ · nº NFs
4. Sem gráficos, filtros, links, botões extras além do que o host passa (retry via refetch no erro)

- [ ] **Step 1: Implementar componente**

```tsx
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePurchaseOpsKpis } from "@/hooks/usePurchaseOpsKpis";
import {
  formatConfirmedVsDraftPct,
  type PurchaseOpsWindowKpis,
} from "@/lib/purchaseOpsKpis";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function WindowCard({ title, w }: { title: string; w: PurchaseOpsWindowKpis }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-xl font-semibold text-foreground">{formatMoney(w.confirmed_amount)}</p>
      <p className="text-sm text-foreground">
        {w.confirmed_count} NF{w.confirmed_count === 1 ? "" : "s"} confirmada{w.confirmed_count === 1 ? "" : "s"}
      </p>
      <p className="text-xs text-muted-foreground">
        {w.cancelled_count} cancelada{w.cancelled_count === 1 ? "" : "s"} ·{" "}
        {formatConfirmedVsDraftPct(w.confirmed_vs_draft_pct)} confirmadas/(confirmadas+rascunhos)
      </p>
    </div>
  );
}

export function GestaoView() {
  const q = usePurchaseOpsKpis();

  if (q.isLoading && !q.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (q.error) {
    return (
      <div className="rounded-lg border border-destructive/30 p-6 text-center space-y-3">
        <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
        <p className="text-sm text-foreground">Não foi possível carregar a Gestão.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void q.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const data = q.data!;
  const emptyConfirmed =
    data.windows.d14.confirmed_count === 0 && data.windows.d30.confirmed_count === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Gestão</h2>
        <p className="text-sm text-muted-foreground">Visão operacional de compras</p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Entradas</h3>
        {emptyConfirmed ? (
          <p className="text-sm text-muted-foreground">Ainda sem compras confirmadas</p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <WindowCard title="Últimos 14 dias" w={data.windows.d14} />
          <WindowCard title="Últimos 30 dias" w={data.windows.d30} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Drafts abertos</h3>
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-xl font-semibold">{data.drafts_open.total}</p>
          <p className="text-xs text-muted-foreground">
            BLING {data.drafts_open.bling} · Farol {data.drafts_open.farol} · Outros{" "}
            {data.drafts_open.other}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Top fornecedores (30 dias)</h3>
        {data.top_suppliers_d30.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum fornecedor no período</p>
        ) : (
          <ul className="rounded-lg border bg-card divide-y">
            {data.top_suppliers_d30.map((s) => (
              <li key={s.supplier_id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                <span className="text-sm text-foreground shrink-0">
                  {formatMoney(s.amount)} · {s.count} NF{s.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit (só se usuário pedir)**

---

### Task 5: Tab Gestão em `Index`

**Files:**
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `GestaoView`, `usePurchaseOpsKpis` (só para refetch no botão Atualizar quando `mode === "gestao"`)

- [ ] **Step 1: Estender `ViewMode`**

```ts
type ViewMode = "pedido" | "analise" | "compras" | "gestao";
```

Importar `LayoutDashboard` de `lucide-react` e `GestaoView`.

- [ ] **Step 2: Botão da tab** (após Compras)

```tsx
<button
  onClick={() => setMode("gestao")}
  className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
    mode === "gestao"
      ? "bg-card text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground"
  }`}
>
  <LayoutDashboard className="h-4 w-4" />
  Gestão
</button>
```

- [ ] **Step 3: Atualizar / render**

- `isFarolMode` permanece só pedido/analise.
- Mostrar botão **Atualizar** também quando `mode === "gestao"` (chama refetch do hook de KPIs).
  - Opção limpa: em `GestaoView` exportar nada; no `Index` chamar `usePurchaseOpsKpis()` e `refetch` no botão quando `gestao` (mesmo queryKey → cache compartilhado).

```tsx
const kpisQuery = usePurchaseOpsKpis();
// no botão Atualizar:
onClick={() => {
  if (mode === "gestao") void kpisQuery.refetch();
  else void farolQuery.refetch();
}}
// mostrar Atualizar se isFarolMode || mode === "gestao"
```

- Corpo:

```tsx
{mode === "compras" ? (
  <PurchasesView ... />
) : mode === "gestao" ? (
  <GestaoView />
) : isLoading || !data ? (
  ...
) : (
  ...
)}
```

- [ ] **Step 4: Smoke manual**

1. Apply SQL Task 2 no live.
2. Abrir app → tab Gestão.
3. Conferir 14/30d vs lista Compras; drafts vs Rascunho; top 5.
4. Forçar erro (RPC inexistente) → mensagem + Tentar de novo (opcional em staging).

- [ ] **Step 5: README**

Em `README.md`, na tabela de migrations / features, adicionar:

`20260807120000_feature_017_purchase_ops_kpis.sql` | FEATURE 017 — KPIs aba Gestão  

E na tabela de views/hooks: Gestão | `usePurchaseOpsKpis` → `GestaoView`

- [ ] **Step 6: Atualizar status da spec** para `implementada no repo — apply migration + aceite UI`

- [ ] **Step 7: Commit (só se usuário pedir)**

---

## Self-review (plan vs spec)

| Spec | Task |
|------|------|
| Aba Gestão | Task 5 |
| Cards 14/30 entradas | Task 4 |
| Cancelados + % | Task 2 + 4 |
| Drafts total/bling/farol/other | Task 2 + 4 |
| Top 5 30d | Task 2 + 4 |
| RPC + security membership | Task 2 |
| Parser/test | Task 1 |
| Loading/vazio/erro/Atualizar | Task 4–5 |
| Sem gráficos/filtros/drill/marketplace/Farol | Global Constraints |

Sem placeholders; nomes alinhados (`get_purchase_ops_kpis`, `parsePurchaseOpsKpis`, `GestaoView`).

---

## Aceite (copiar da spec)

- [ ] Migration aplicada no live
- [ ] Aba Gestão visível e carrega KPIs
- [ ] 14d/30d coerentes com compras confirmadas na lista
- [ ] Drafts abertos batem com filtro Rascunho (+ origem)
- [ ] Top 5 bate com confirmados dos últimos 30 dias
- [ ] Loading / vazio / erro ok
