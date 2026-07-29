# FEATURE 009 — Módulo de Compras (Fundação) Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. User requested **inline execution** in stages: migration → backend → UI → tests. Do **not** commit unless the user asks.

**Goal:** Fundação do módulo de compras: tabelas `purchases` / `purchase_items`, RLS, CRUD manual na aba Compras, com confirmed imutável.

**Architecture:** Migration SQL + hooks React Query + aba no Index. Totais e regras de status no cliente. Sem triggers, sem views Farol, sem import.

**Tech Stack:** Supabase Postgres, React, TanStack Query, shadcn Sheet/AlertDialog, Vitest.

## Global Constraints

- Não alterar Motor de Abastecimento, Lista de Compra, views, n8n, BI, logística.
- Não alterar lógica de `product_suppliers` (só FK nullable em items).
- `confirmed` é imutável; correção = cancelar + nova compra.
- Hard delete só em `draft`.
- Sem BI/gráficos/importação nesta feature.
- Company single-tenant anon: `04c9b2c3-1c6e-439b-949a-486e4917b13c`.

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260729160000_feature_009_purchases_module.sql` | Schema + RLS |
| `src/lib/purchaseStatus.ts` | Helpers de status/permissões/labels |
| `src/lib/purchaseTotals.ts` | Soma de itens → total_amount / total_cost |
| `src/hooks/usePurchases.ts` | List/get/CRUD/confirm/cancel/delete |
| `src/components/purchases/PurchasesView.tsx` | Lista + filtros |
| `src/components/purchases/PurchaseSheet.tsx` | Form/detalhe |
| `src/components/purchases/PurchaseStatusBadge.tsx` | Badge colorido |
| `src/pages/Index.tsx` | Aba Compras |
| `src/integrations/supabase/types.ts` | Tipos purchases / purchase_items |
| `src/test/purchaseStatus.test.ts` | Testes de regras |
| `src/test/purchaseTotals.test.ts` | Testes de totais |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/20260729160000_feature_009_purchases_module.sql`

- [ ] **Step 1: Create migration SQL**

Create tables `purchases` and `purchase_items` with FKs, checks, partial unique, indexes, RLS (anon + authenticated) matching FEATURE 007 style. Items RLS via `EXISTS` on parent purchase.

- [ ] **Step 2: Apply migration**

Prefer Supabase MCP `apply_migration` on the live project, or instruct user to run SQL. Confirm tables exist via `list_tables` / SQL.

---

### Task 2: Domain helpers + tests (TDD)

**Files:**
- Create: `src/lib/purchaseStatus.ts`, `src/lib/purchaseTotals.ts`
- Create: `src/test/purchaseStatus.test.ts`, `src/test/purchaseTotals.test.ts`

**Produces:**
- `canEditPurchase(status)`, `canDeletePurchase(status)`, `canConfirmPurchase(status)`, `canCancelPurchase(status)`
- `SOURCE_LABELS`, `statusBadgeMeta(status)`
- `lineTotal(qty, unitCost)`, `sumPurchaseTotal(items)`

- [ ] **Step 1: Write failing tests** for immutability helpers and totals
- [ ] **Step 2: Implement helpers**
- [ ] **Step 3: Run `npx vitest run src/test/purchaseStatus.test.ts src/test/purchaseTotals.test.ts`** — expect PASS

---

### Task 3: Types + usePurchases

**Files:**
- Modify: `src/integrations/supabase/types.ts` — add `purchases`, `purchase_items`
- Create: `src/hooks/usePurchases.ts`

**Produces:**
- `usePurchasesList(statusFilter?)`, `usePurchase(id)`, mutations: createDraft, updateDraft, replaceItems, confirm, cancel, deleteDraft
- Guard: mutations that edit payload reject if status ≠ draft (except confirm/cancel status transitions)

- [ ] **Step 1: Add Database types**
- [ ] **Step 2: Implement hook** (recalc total_amount on item save; set source=manual on create; received_at optional)
- [ ] **Step 3: Smoke-check TypeScript** via editor / `npx tsc --noEmit` if feasible

---

### Task 4: UI

**Files:**
- Create: `PurchaseStatusBadge.tsx`, `PurchasesView.tsx`, `PurchaseSheet.tsx`
- Modify: `Index.tsx` — mode `compras`; aba independente do Farol

- [ ] **Step 1: Badge + lista**
- [ ] **Step 2: Sheet** com AlertDialog na confirmação (texto exato do spec)
- [ ] **Step 3: Wire Index** — Compras não bloqueada por loading/empty do Farol

---

### Task 5: Verification

- [ ] Run unit tests
- [ ] Deliver validation report (tables, FKs, components, migration, future history, no Farol changes)

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Tables + FKs + source/external_id + issued/received + product_supplier_id | 1 |
| Status rules + confirm dialog | 2, 4 |
| Aba CRUD | 4 |
| Future import prep | 1 (schema) + 4 (origem UI) |
| No Farol/views changes | Global |
| Tests | 2, 5 |
