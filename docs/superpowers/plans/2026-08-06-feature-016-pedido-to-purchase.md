# FEATURE 016 — Pedido → compra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No Pedido, gerar rascunho de compra (`source=farol`) a partir de um fornecedor (todas as linhas ou seleção), abrir `PurchaseSheet` para revisar e salvar.

**Architecture:** Função pura `buildFarolPurchaseSeed` + UI em `SupplierOrderView` (checkbox + Gerar) + seed no `PurchaseSheet` / host `Index`. Migration amplia CHECK de `source`. Spec: `docs/superpowers/specs/2026-08-06-feature-016-pedido-to-purchase-design.md`.

**Tech Stack:** React + Vite + TanStack Query + Supabase + Vitest + PostgreSQL CHECK.

## Global Constraints

- `source = 'farol'` obrigatório nos drafts gerados.
- Só aba **Pedido**; Análise fora.
- Bloco sem `supplier_id`: sem botão Gerar.
- Sem custo / qty ≤ 0: omitir; zero elegíveis → não abrir sheet.
- Qty = `Math.round(sugestao_compra ?? 0)`; custo = `cost_price`.
- BLING export fora (016.1).
- Commits só se o usuário pedir; sem push salvo pedido.
- Não alterar views Farol / composeLogistics.

---

## File map

| Path | Responsabilidade |
|------|------------------|
| `supabase/migrations/20260806160000_feature_016_purchase_source_farol.sql` | CHECK inclui `farol` |
| `src/lib/purchaseStatus.ts` | Tipo + label Farol |
| `src/lib/purchaseImport/buildFarolPurchaseSeed.ts` | Mapper puro |
| `src/test/buildFarolPurchaseSeed.test.ts` | Testes do mapper |
| `src/components/farol/SupplierOrderView.tsx` | Checkbox + Gerar compra |
| `src/components/purchases/PurchaseSheet.tsx` | `initialFarolSeed` |
| `src/pages/Index.tsx` | Estado seed + abrir sheet / mode compras |
| `src/components/purchases/PurchasesView.tsx` | Se necessário, props para sheet externo |
| `README.md` | FEATURE 016 |

---

### Task 1: Migration + tipo `farol`

**Files:**
- Create: `supabase/migrations/20260806160000_feature_016_purchase_source_farol.sql`
- Modify: `src/lib/purchaseStatus.ts`
- Modify: `src/test/purchaseStatus.test.ts` (se existir asserts de source)

**Interfaces:**
- Produces: DB aceita `source='farol'`; `PurchaseSource` inclui `"farol"`; label `"Farol"`

- [ ] **Step 1: Migration**

```sql
-- FEATURE 016: allow purchases.source = 'farol'

ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_source_check;
ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_source_check
  CHECK (source IN ('manual', 'xml', 'csv', 'bling', 'farol'));
```

- [ ] **Step 2: Types**

Em `purchaseStatus.ts`:

```ts
export type PurchaseSource = "manual" | "xml" | "csv" | "bling" | "farol";

export const SOURCE_LABELS: Record<PurchaseSource, string> = {
  manual: "Manual",
  xml: "XML",
  csv: "CSV",
  bling: "BLING",
  farol: "Farol",
};
```

- [ ] **Step 3: Teste label (se houver teste de SOURCE_LABELS)** — garantir `SOURCE_LABELS.farol === "Farol"`.

- [ ] **Step 4: Commit (se usuário pedir)**

```bash
git add supabase/migrations/20260806160000_feature_016_purchase_source_farol.sql src/lib/purchaseStatus.ts
git commit -m "feat(016): allow purchases source farol"
```

---

### Task 2: `buildFarolPurchaseSeed` + testes (TDD)

**Files:**
- Create: `src/lib/purchaseImport/buildFarolPurchaseSeed.ts`
- Create: `src/test/buildFarolPurchaseSeed.test.ts`

**Interfaces:**
- Consumes: `FarolItem` shape (`product_id`, `sugestao_compra`, `cost_price`, `product_name`, sku fields if any)
- Produces: `FarolPurchaseSeed` | `{ ok: false, reason: 'no_eligible_items' }`

- [ ] **Step 1: Escrever testes que falham**

```ts
import { describe, expect, it } from "vitest";
import { buildFarolPurchaseSeed } from "@/lib/purchaseImport/buildFarolPurchaseSeed";

const base = {
  product_id: "p1",
  product_name: "Vinho X",
  sugestao_compra: 10.4,
  cost_price: 42,
  supplier_id: "s1",
  supplier_name: "Forn",
};

describe("buildFarolPurchaseSeed", () => {
  it("maps qty round and unit_cost", () => {
    const r = buildFarolPurchaseSeed({
      supplierId: "s1",
      supplierName: "Forn",
      items: [base as any],
      issuedAt: "2026-08-06",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seed.items[0].quantity).toBe(10);
    expect(r.seed.items[0].unit_cost).toBe(42);
    expect(r.seed.source).toBe("farol");
  });

  it("skips null cost and counts skippedNoCost", () => {
    const r = buildFarolPurchaseSeed({
      supplierId: "s1",
      supplierName: "Forn",
      items: [
        base as any,
        { ...base, product_id: "p2", cost_price: null } as any,
      ],
      issuedAt: "2026-08-06",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seed.items).toHaveLength(1);
    expect(r.seed.skippedNoCost).toBe(1);
  });

  it("returns no_eligible when all skipped", () => {
    const r = buildFarolPurchaseSeed({
      supplierId: "s1",
      supplierName: "Forn",
      items: [{ ...base, cost_price: null } as any],
      issuedAt: "2026-08-06",
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run src/test/buildFarolPurchaseSeed.test.ts
```

Expected: FAIL (módulo ausente).

- [ ] **Step 3: Implementar**

```ts
export type FarolPurchaseSeedItem = {
  product_id: string;
  productName: string | null;
  productSku: string | null;
  quantity: number;
  unit_cost: number;
};

export type FarolPurchaseSeed = {
  supplierId: string;
  supplierName: string;
  issuedAt: string;
  source: "farol";
  items: FarolPurchaseSeedItem[];
  skippedNoCost: number;
  skippedNonPositiveQty: number;
};

type FarolLike = {
  product_id: string;
  product_name?: string | null;
  sku?: string | null;
  sugestao_compra?: number | null;
  cost_price?: number | null;
};

export function buildFarolPurchaseSeed(input: {
  supplierId: string;
  supplierName: string;
  items: FarolLike[];
  issuedAt: string;
}): { ok: true; seed: FarolPurchaseSeed } | { ok: false; reason: "no_eligible_items" } {
  let skippedNoCost = 0;
  let skippedNonPositiveQty = 0;
  const items: FarolPurchaseSeedItem[] = [];

  for (const it of input.items) {
    const quantity = Math.round(Number(it.sugestao_compra ?? 0));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      skippedNonPositiveQty += 1;
      continue;
    }
    const cost = it.cost_price;
    if (cost == null || !Number.isFinite(Number(cost))) {
      skippedNoCost += 1;
      continue;
    }
    items.push({
      product_id: it.product_id,
      productName: it.product_name ?? null,
      productSku: it.sku ?? null,
      quantity,
      unit_cost: Number(cost),
    });
  }

  if (items.length === 0) {
    return { ok: false, reason: "no_eligible_items" };
  }

  return {
    ok: true,
    seed: {
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      issuedAt: input.issuedAt,
      source: "farol",
      items,
      skippedNoCost,
      skippedNonPositiveQty,
    },
  };
}
```

- [ ] **Step 4: Run testes — PASS**

- [ ] **Step 5: Commit (se usuário pedir)**

---

### Task 3: PurchaseSheet aceita `initialFarolSeed`

**Files:**
- Modify: `src/components/purchases/PurchaseSheet.tsx`
- Modify: `src/hooks/usePurchases.ts` só se `createDraft` precisar tipar source (já opcional)

**Interfaces:**
- Consumes: `FarolPurchaseSeed`
- Produces: draft salvo com `source: "farol"`

- [ ] **Step 1: Props**

```ts
initialFarolSeed?: FarolPurchaseSeed | null;
```

- [ ] **Step 2: No `useEffect` de init (nova compra):** se `initialFarolSeed`, setar supplierId, issuedAt, lines a partir de `seed.items` (incluir productName/Sku no lineLabel se o sheet já faz isso no XML).

- [ ] **Step 3: No `createDraft`:** `source: initialFarolSeed ? "farol" : (xml ? "xml" : "manual")` — preservar lógica XML existente.

- [ ] **Step 4: Smoke manual / typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit (se usuário pedir)**

---

### Task 4: SupplierOrderView — seleção + Gerar + callback

**Files:**
- Modify: `src/components/farol/SupplierOrderView.tsx`
- Modify: `src/pages/Index.tsx` (passar `onGeneratePurchase`)

**Interfaces:**
- Produces: chama `onGeneratePurchase(seed: FarolPurchaseSeed)` após build ok

- [ ] **Step 1: Props**

```ts
onGeneratePurchase?: (seed: FarolPurchaseSeed) => void;
```

- [ ] **Step 2: Estado** `selectedBySupplier: Record<string, Set<string>>` ou `Map`.

- [ ] **Step 3: Checkbox** em `SupplierItemRow` (controlled).

- [ ] **Step 4: Botão Gerar** no header do bloco se `group.supplier_id` válido:

```ts
const selected = /* product ids selected for this supplier */;
const pool = selected.size > 0
  ? group.items.filter((i) => selected.has(i.product_id))
  : group.items;
const result = buildFarolPurchaseSeed({
  supplierId: group.supplier_id!,
  supplierName: group.supplier_name ?? "Fornecedor",
  items: pool,
  issuedAt: new Date().toISOString().slice(0, 10),
});
if (!result.ok) {
  toast({ title: "Nenhum item elegível", description: "Itens sem custo ou quantidade inválida.", variant: "destructive" });
  return;
}
if (result.seed.skippedNoCost > 0) {
  toast({ title: "Itens omitidos", description: `${result.seed.skippedNoCost} sem custo ficaram de fora.` });
}
onGeneratePurchase?.(result.seed);
```

- [ ] **Step 5: Commit (se usuário pedir)**

---

### Task 5: Index / PurchasesView — abrir sheet com seed

**Files:**
- Modify: `src/pages/Index.tsx`
- Modify: `src/components/purchases/PurchasesView.tsx` se o sheet viver lá

**Interfaces:**
- Consumes: seed do Pedido
- Produces: `mode=compras`, sheet open, `initialFarolSeed=seed`

- [ ] **Step 1: Estado** `farolSeed` + `purchaseSheetOpen` no host que já controla `PurchaseSheet` (ler `Index.tsx` / `PurchasesView` e seguir o padrão XML `onXmlReady`).

- [ ] **Step 2: Em `onGeneratePurchase`:** set seed, abrir sheet, `setMode("compras")` se o modo existir.

- [ ] **Step 3: Ao fechar sheet:** limpar seed (igual XML).

- [ ] **Step 4: Commit (se usuário pedir)**

---

### Task 6: Docs + aceite + SQL live

**Files:**
- Modify: `README.md`
- Modify: spec status → implementada após aceite

- [ ] **Step 1: README** — migration + item 016 no resumo.

- [ ] **Step 2: Usuário aplica migration** no SQL Editor:

```sql
ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_source_check;
ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_source_check
  CHECK (source IN ('manual', 'xml', 'csv', 'bling', 'farol'));
```

- [ ] **Step 3: Aceite manual** — checklist da spec.

- [ ] **Step 4: Não-regressão**

```bash
npx vitest run src/test/buildFarolPurchaseSeed.test.ts src/test/purchaseStatus.test.ts src/test/matchPurchaseImport.test.ts
npx tsc --noEmit
```

Expected: PASS / 0.

---

## Spec coverage

| Spec | Task |
|------|------|
| source farol | 1 |
| mapper + skip custo/qty | 2 |
| PurchaseSheet seed | 3 |
| Checkbox + Gerar | 4 |
| Abrir sheet / navegar | 5 |
| Docs + apply + aceite | 6 |
| Fora: BLING, Análise | — |

---

## Execution Handoff

Plan em `docs/superpowers/plans/2026-08-06-feature-016-pedido-to-purchase.md`.

**1. Subagent-Driven (recomendado)**  
**2. Inline nesta sessão**

Qual abordagem para implementar?
