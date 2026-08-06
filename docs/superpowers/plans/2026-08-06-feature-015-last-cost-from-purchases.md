# FEATURE 015 — Último custo a partir de compras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao confirmar compra (`draft → confirmed`), gravar o último `unit_cost` em `products.cost_price` e em `product_suppliers.cost_price` do fornecedor da compra (se existir vínculo); backfill one-shot do histórico confirmed.

**Architecture:** Trigger SQL `SECURITY DEFINER` em `purchases` (irmão do trigger de estoque 012). Sem mudança obrigatória no app/n8n — `confirmPurchase` e RPC `import_purchase_nfe` já fazem `UPDATE status='confirmed'`. Spec: `docs/superpowers/specs/2026-08-06-feature-015-last-cost-from-purchases-design.md`. Texto cliente: `docs/superpowers/specs/2026-08-06-feature-015-cliente-validacao.md`.

**Tech Stack:** PostgreSQL (trigger) + Supabase SQL Editor (apply/smoke) + README.

## Global Constraints

- Métrica: **último custo** apenas (não média).
- Momento: só `OLD.status = 'draft' AND NEW.status = 'confirmed'`.
- Cancel: **não** altera `cost_price`.
- Destino: `products.cost_price` + `product_suppliers` do par `(product_id, purchases.supplier_id)` se existir; senão só products.
- Mesmo `product_id` várias vezes na compra: usar linha com **`purchase_items.id` máximo**.
- `unit_cost = 0` também grava.
- Não alterar views Farol / `composeLogistics` / motor de cálculo (já leem `COALESCE(ps.cost_price, p.cost_price)`).
- Não criar `product_suppliers` automaticamente.
- Commits **só** se o usuário pedir; **sem push** salvo pedido explícito.
- Live apply: usuário cola SQL no Editor do projeto `ilrebasidmyltziuibyc` (MCP pode não ter acesso).
- `company_id` Farol: `04c9b2c3-1c6e-439b-949a-486e4917b13c`.

---

## File map

| Path | Responsabilidade |
|------|------------------|
| `supabase/migrations/20260806150000_feature_015_last_purchase_cost.sql` | Função + trigger + backfill idempotente |
| `README.md` | Registrar FEATURE 015 + migration |
| `docs/superpowers/specs/2026-08-06-feature-015-last-cost-from-purchases-design.md` | Status → implementada (após aceite) |
| `docs/superpowers/specs/2026-08-06-roadmap-pos-012-design.md` | Marcar 015 em andamento/feita (opcional) |

**Não tocar:** `usePurchases.ts` (já só muda status), n8n, views Farol, FEATURE 003 dual-write (convive: update em `products.cost_price` pode espelhar no primary; update explícito no PS da compra cobre supplier ≠ primary).

---

### Task 1: Migration — função + trigger de último custo

**Files:**
- Create: `supabase/migrations/20260806150000_feature_015_last_purchase_cost.sql` (parte trigger; backfill na Task 2 no **mesmo** arquivo ou migration seguinte — preferir **mesmo arquivo** em duas seções)

**Interfaces:**
- Consumes: `purchases`, `purchase_items`, `products`, `product_suppliers`
- Produces: `fz_apply_last_purchase_cost()`, `trg_purchase_last_cost`

- [ ] **Step 1: Criar o arquivo de migration com a função**

Conteúdo (seção 1 — trigger):

```sql
-- FEATURE 015: último custo na confirmação de compra
-- Spec: docs/superpowers/specs/2026-08-06-feature-015-last-cost-from-purchases-design.md
--
-- draft → confirmed: atualiza products.cost_price e product_suppliers.cost_price
--   (supplier da compra), usando purchase_items com maior id por product_id.
-- confirmed → cancelled: NÃO altera custo (estoque fica a cargo do trigger 012).

CREATE OR REPLACE FUNCTION public.fz_apply_last_purchase_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status = 'draft'
     AND NEW.status = 'confirmed' THEN

    FOR r IN
      SELECT DISTINCT ON (pi.product_id)
        pi.product_id,
        pi.unit_cost
      FROM public.purchase_items pi
      WHERE pi.purchase_id = NEW.id
      ORDER BY pi.product_id, pi.id DESC
    LOOP
      UPDATE public.products p
      SET cost_price = r.unit_cost
      WHERE p.id = r.product_id
        AND p.company_id = NEW.company_id;

      UPDATE public.product_suppliers ps
      SET cost_price = r.unit_cost,
          updated_at = now()
      WHERE ps.company_id = NEW.company_id
        AND ps.product_id = r.product_id
        AND ps.supplier_id = NEW.supplier_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_last_cost ON public.purchases;

CREATE TRIGGER trg_purchase_last_cost
AFTER UPDATE OF status ON public.purchases
FOR EACH ROW
EXECUTE FUNCTION public.fz_apply_last_purchase_cost();

COMMENT ON FUNCTION public.fz_apply_last_purchase_cost() IS
  'FEATURE 015: on draft→confirmed set products/product_suppliers cost_price from last purchase line unit_cost.';
```

**Nota:** se `product_suppliers` live **não** tiver coluna `updated_at`, remover `updated_at = now()` do UPDATE (verificar no Step 2).

- [ ] **Step 2: Verificar colunas live antes de aplicar**

No SQL Editor:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'product_suppliers'
  AND column_name IN ('cost_price', 'updated_at', 'supplier_id', 'product_id');
```

Expected: `cost_price`, `supplier_id`, `product_id` existem. Ajustar migration se `updated_at` ausente.

- [ ] **Step 3: Não aplicar ainda no live** até Task 2 (backfill) estar no mesmo script — ou aplicar só a seção trigger e backfill em seguida na mesma sessão.

- [ ] **Step 4: Commit (se o usuário pedir)**

```bash
git add supabase/migrations/20260806150000_feature_015_last_purchase_cost.sql
git commit -m "feat(015): trigger last purchase cost on confirm"
```

---

### Task 2: Backfill one-shot no mesmo migration

**Files:**
- Modify: `supabase/migrations/20260806150000_feature_015_last_purchase_cost.sql` (append seção backfill)

**Interfaces:**
- Consumes: histórico `purchases` confirmed + `purchase_items`
- Produces: `products` / `product_suppliers` alinhados ao último custo confirmed

- [ ] **Step 1: Append backfill idempotente (versão final)**

```sql
-- FEATURE 015: backfill — último unit_cost por produto entre compras confirmed
-- Idempotente: rerodar produz o mesmo estado.

WITH last_line AS (
  SELECT DISTINCT ON (p.company_id, pi.product_id)
    p.company_id,
    p.supplier_id,
    pi.product_id,
    pi.unit_cost
  FROM public.purchases p
  JOIN public.purchase_items pi ON pi.purchase_id = p.id
  WHERE p.status = 'confirmed'
  ORDER BY
    p.company_id,
    pi.product_id,
    p.issued_at DESC NULLS LAST,
    p.updated_at DESC NULLS LAST,
    p.id DESC,
    pi.id DESC
)
UPDATE public.products prod
SET cost_price = ll.unit_cost
FROM last_line ll
WHERE prod.id = ll.product_id
  AND prod.company_id = ll.company_id;

WITH last_line AS (
  SELECT DISTINCT ON (p.company_id, pi.product_id)
    p.company_id,
    p.supplier_id,
    pi.product_id,
    pi.unit_cost
  FROM public.purchases p
  JOIN public.purchase_items pi ON pi.purchase_id = p.id
  WHERE p.status = 'confirmed'
  ORDER BY
    p.company_id,
    pi.product_id,
    p.issued_at DESC NULLS LAST,
    p.updated_at DESC NULLS LAST,
    p.id DESC,
    pi.id DESC
)
UPDATE public.product_suppliers ps
SET cost_price = ll.unit_cost
FROM last_line ll
WHERE ps.company_id = ll.company_id
  AND ps.product_id = ll.product_id
  AND ps.supplier_id = ll.supplier_id;
```

(Se `product_suppliers.updated_at` existir no live, incluir `updated_at = now()` no segundo UPDATE.)

- [ ] **Step 2: Garantir que o arquivo da migration contém só trigger (Task 1) + este backfill** — sem rascunhos.

- [ ] **Step 3: Commit (se o usuário pedir)**

```bash
git add supabase/migrations/20260806150000_feature_015_last_purchase_cost.sql
git commit -m "feat(015): backfill last purchase cost into products and product_suppliers"
```

---

### Task 3: Aplicar no live + smoke SQL

**Files:** nenhum (ops)

**Interfaces:**
- Consome migration Task 1–2

- [ ] **Step 1: Colar o SQL completo no SQL Editor** do projeto correto e executar.

- [ ] **Step 2: Smoke — confirmar compra atualiza custo**

Substituir UUIDs por dados reais da company (pegar um draft existente ou criar via UI):

```sql
-- Prévia: anotar cost_price atual de um produto de um draft
-- Depois na UI: Confirmar compra
-- Então:

SELECT p.sku, p.name, p.cost_price
FROM products p
WHERE p.id = '<product_id>'
  AND p.company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c';

SELECT ps.cost_price, ps.supplier_id
FROM product_suppliers ps
WHERE ps.product_id = '<product_id>'
  AND ps.supplier_id = '<supplier_id_da_compra>'
  AND ps.company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c';
```

Expected: `cost_price` = `unit_cost` da linha confirmada.

- [ ] **Step 3: Smoke — cancel não reverte custo**

```sql
-- Anotar cost_price, cancelar compra na UI, releitura:
-- cost_price deve ser o MESMO.
```

- [ ] **Step 4: Smoke — backfill amostral**

```sql
SELECT count(*) FILTER (WHERE p.cost_price IS NOT NULL) AS com_custo
FROM products p
WHERE p.company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c';
```

Expected: contagem coerente com produtos que tiveram compra confirmed (não precisa ser 100% do catálogo).

- [ ] **Step 5: Sem commit** (só ops)

---

### Task 4: Docs + status da spec

**Files:**
- Modify: `README.md` (migration table + FEATURES resumo)
- Modify: `docs/superpowers/specs/2026-08-06-feature-015-last-cost-from-purchases-design.md` (Status → implementada após aceite Task 3)
- Modify: `docs/superpowers/specs/2026-08-06-roadmap-pos-012-design.md` (015 feita)

- [ ] **Step 1: README — adicionar linha de migration**

```markdown
| `20260806150000_feature_015_last_purchase_cost.sql` | FEATURE 015 — último custo na confirmação de compra (+ backfill) |
```

E no resumo:

```markdown
13. **015** — Último custo do produto a partir de compras confirmadas (trigger + backfill)
```

(Ajustar numeração da seção se ainda disser “001–012” → “001–015” ou “001–012 + 015”.)

- [ ] **Step 2: Atualizar status da spec 015** para `implementada` só depois do smoke Task 3 OK.

- [ ] **Step 3: Commit docs (se o usuário pedir)**

```bash
git add README.md docs/superpowers/specs/2026-08-06-feature-015-last-cost-from-purchases-design.md docs/superpowers/specs/2026-08-06-roadmap-pos-012-design.md
git commit -m "docs(015): register last purchase cost feature"
```

---

### Task 5: Aceite + não-regressão

**Files:** nenhum obrigatório

- [ ] **Step 1: Checklist aceite (spec)**

- [ ] Confirm draft → `products.cost_price` = unit_cost  
- [ ] Com vínculo PS mesmo supplier → `ps.cost_price` atualizado  
- [ ] Sem vínculo PS → só products; sem erro  
- [ ] Cancel → custo inalterado; estoque reverte (012)  
- [ ] Compra BLING auto-confirmed (se houver nova) → custo aplicado  
- [ ] Backfill rodou sem erro  
- [ ] Pedido/Farol mostra valor coerente com novo custo (smoke visual)

- [ ] **Step 2: Não-regressão TS**

```bash
npx tsc --noEmit
npx vitest run src/test/purchaseStatus.test.ts src/test/purchaseTotals.test.ts src/test/matchPurchaseImport.test.ts
```

Expected: EXIT 0 / PASS (nenhum arquivo TS de cálculo Farol deve ter mudado).

- [ ] **Step 3: Commit final só se usuário pedir**

---

## Spec coverage (self-review)

| Spec | Task |
|------|------|
| Último custo no confirm | 1 |
| products + PS fornecedor da compra | 1 |
| Cancel não recalcula | 1 (sem branch cancel) + 3 smoke |
| `purchase_items.id` máximo se duplicata | 1 (`DISTINCT ON … id DESC`) |
| Backfill one-shot | 2 |
| Sem mudança app obrigatória | implícito |
| Farol inalterado | Global Constraints + Task 5 |
| Docs / README | 4 |
| Aceite | 3 + 5 |
| Fora: média, UI histórico, criar PS | não há task |

**Placeholder scan:** Task 2 usa só o bloco SQL final (sem rascunhos).

---

## Execution Handoff

Plan completo em `docs/superpowers/plans/2026-08-06-feature-015-last-cost-from-purchases.md`.

**Duas opções de execução:**

1. **Subagent-Driven (recomendado)** — um subagente por task, review entre tasks  
2. **Inline** — executar nesta sessão com checkpoints  

**Qual abordagem?** (Só implementar quando você mandar; sync pode continuar em paralelo.)
