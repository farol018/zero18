# FEATURE 012 — BLING NFe entrada → compras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar NFe de **entrada** (compras) do BLING via n8n → RPC Postgres que faz match, cria `purchases`/`purchase_items` (`confirmed` se 100% match, senão `draft`) e escreve `inventory_movements` na confirmação; XML manual (011) permanece e também passa a movimentar estoque no confirm.

**Architecture:** n8n só lista/detalha BLING (`tipo=0`, 14 dias) e chama `import_purchase_nfe(company_id, payload)`. Toda regra (devolução, match, insert, status) vive no banco. Trigger em `purchases` sincroniza estoque em `draft→confirmed` e reverte em `confirmed→cancelled`. Spec: `docs/superpowers/specs/2026-08-04-feature-012-bling-purchase-entrada-import-design.md`.

**Tech Stack:** PostgreSQL (RPC/triggers) + Supabase service_role + n8n + Vitest (paridade de match TS se houver helper) + React app existente (mínimo).

## Global Constraints

- Somente **compras**; **devoluções/retornos não importam**.
- Janela sync: **14 dias** rolante (sem checkpoint).
- Match 100% → `confirmed` + estoque; incompleto → `draft` sem estoque.
- Premissa: NFe entrada no BLING = mercadoria entrou (estoque na confirmação).
- Lógica no **banco**; n8n não reimplementa match.
- `source = 'bling'` no sync; XML continua `source = 'xml'`.
- `external_id` = chave NFe 44 dígitos; unique `(company_id, source, external_id)`.
- Não alterar Motor Farol, Lista, Pedido, `composeLogistics`, views Farol.
- Sync vendas (`tipo=1`) intocado.
- Não criar produto/fornecedor automático.
- Commits só se o usuário pedir explicitamente (não incluir push).
- `company_id` Farol: `04c9b2c3-1c6e-439b-949a-486e4917b13c`.
- Supabase: `https://ilrebasidmyltziuibyc.supabase.co`.

---

## File map

| Path | Responsabilidade |
|------|------------------|
| `supabase/migrations/20260804210000_inventory_movements_write_rls.sql` | Policies write authenticated em `inventory_movements` (já no repo; aplicar no live) |
| `supabase/migrations/20260804220000_feature_012_align_purchase_items_schema.sql` | Alinhar `purchase_items.company_id` + `total_cost` generated se migrations 009 estiverem atrás |
| `supabase/migrations/20260804221000_feature_012_import_purchase_nfe_rpc.sql` | Helpers + RPC `import_purchase_nfe` |
| `supabase/migrations/20260804222000_feature_012_purchase_stock_trigger.sql` | Trigger confirm/cancel → `inventory_movements` |
| `n8n/farol-bling-sync-compras.json` | Workflow entrada BLING → RPC |
| `n8n/README-bling-sync.md` | Documentar workflow compras |
| `README.md` | FEATURE 012 no resumo |
| `src/hooks/usePurchases.ts` | Já omite `total_cost` e envia `company_id`; verificar sem regressão |
| `docs/superpowers/specs/2026-08-04-feature-012-bling-purchase-entrada-import-design.md` | Spec (já commitada) |

---

### Task 1: Aplicar RLS de `inventory_movements` + alinhar schema `purchase_items`

**Files:**
- Existing: `supabase/migrations/20260804210000_inventory_movements_write_rls.sql`
- Create: `supabase/migrations/20260804220000_feature_012_align_purchase_items_schema.sql`
- Modify: `src/integrations/supabase/types.ts` (`purchase_items` Row/Insert com `company_id`; `total_cost` never on Insert)

**Interfaces:**
- Produces: `purchase_items.company_id` NOT NULL; `total_cost` generated `quantity * unit_cost`; policies write em `inventory_movements`

- [ ] **Step 1: Confirmar no SQL Editor o estado live**

Run:

```sql
SELECT column_name, is_nullable, is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'purchase_items'
  AND column_name IN ('company_id', 'total_cost', 'quantity', 'unit_cost');

SELECT polname, cmd
FROM pg_policy
WHERE polrelid = 'public.inventory_movements'::regclass;
```

Expected: anotar se `company_id` / generated `total_cost` / policies insert já existem.

- [ ] **Step 2: Criar migration de alinhamento (idempotente)**

```sql
-- FEATURE 012: alinhar purchase_items ao schema live usado na homologação 011

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

UPDATE public.purchase_items pi
SET company_id = p.company_id
FROM public.purchases p
WHERE pi.purchase_id = p.id
  AND pi.company_id IS NULL;

ALTER TABLE public.purchase_items
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_items_company_id_idx
  ON public.purchase_items (company_id);

-- total_cost generated (só se ainda for coluna normal)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_items'
      AND column_name = 'total_cost'
      AND is_generated = 'NEVER'
  ) THEN
    ALTER TABLE public.purchase_items DROP COLUMN total_cost;
    ALTER TABLE public.purchase_items
      ADD COLUMN total_cost numeric
      GENERATED ALWAYS AS (round(quantity * unit_cost, 2)) STORED;
  END IF;
END $$;
```

- [ ] **Step 3: Aplicar no live (SQL Editor)**

1. Conteúdo de `20260804210000_inventory_movements_write_rls.sql`
2. Conteúdo de `20260804220000_feature_012_align_purchase_items_schema.sql`

Expected: sem erro; re-rodar Step 1 mostra `company_id` NOT NULL e policies INSERT.

- [ ] **Step 4: Atualizar `types.ts` se ainda divergir**

`purchase_items.Insert` deve exigir `company_id: string` e `total_cost?: never`.

- [ ] **Step 5: Commit (só se o usuário pedir)**

```bash
git add supabase/migrations/20260804220000_feature_012_align_purchase_items_schema.sql src/integrations/supabase/types.ts
git commit -m "feat(012): align purchase_items company_id and generated total_cost"
```

---

### Task 2: Helpers SQL — devolução + normalização + match

**Files:**
- Create: `supabase/migrations/20260804221000_feature_012_import_purchase_nfe_rpc.sql` (parte 1: functions auxiliares; RPC na Task 3 no mesmo arquivo ou split)

**Interfaces:**
- Produces:
  - `public.fz_is_purchase_return(p_payload jsonb) → boolean`
  - `public.fz_normalize_digits(text) → text`
  - `public.fz_normalize_code(text) → text`
  - `public.fz_match_supplier(p_company_id uuid, p_document text) → uuid`
  - `public.fz_match_product(p_company_id uuid, p_supplier_id uuid, p_item jsonb) → uuid`

- [ ] **Step 1: Escrever functions auxiliares na migration**

```sql
CREATE OR REPLACE FUNCTION public.fz_normalize_digits(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.fz_normalize_code(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(upper(trim(coalesce(p, ''))), '');
$$;

CREATE OR REPLACE FUNCTION public.fz_is_purchase_return(p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  nat text := lower(coalesce(p_payload->>'natureza', p_payload->>'naturezaOperacao', ''));
  cfops text := lower(coalesce(p_payload->>'cfops', p_payload#>>'{cfops}', ''));
BEGIN
  IF nat ~ 'devolu' OR nat ~ 'retorno' THEN
    RETURN true;
  END IF;
  -- CFOPs comuns de devolução de compra (ajustar com amostras reais do tenant)
  IF cfops ~ '\m(1201|1202|2201|2202|1410|2410)\M' THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.fz_match_supplier(p_company_id uuid, p_document text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  doc text := public.fz_normalize_digits(p_document);
  sid uuid;
BEGIN
  IF doc IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT s.id INTO sid
  FROM public.suppliers s
  WHERE s.company_id = p_company_id
    AND public.fz_normalize_digits(s.document) = doc
  LIMIT 2;
  IF FOUND THEN
    -- ambíguo se houver >1: só aceita se exatamente 1
    IF (SELECT count(*) FROM public.suppliers s
        WHERE s.company_id = p_company_id
          AND public.fz_normalize_digits(s.document) = doc) = 1 THEN
      RETURN sid;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fz_match_product(
  p_company_id uuid,
  p_supplier_id uuid,
  p_item jsonb
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_gtin text := public.fz_normalize_code(p_item->>'gtin');
  v_cprod text := public.fz_normalize_code(p_item->>'supplier_product_code');
  v_sku text := public.fz_normalize_code(p_item->>'sku');
  v_ext text := public.fz_normalize_code(p_item->>'code_internal');
  v_name text := lower(trim(regexp_replace(coalesce(p_item->>'name', ''), '\s+', ' ', 'g')));
  pid uuid;
  cnt int;
BEGIN
  IF v_gtin IS NOT NULL AND v_gtin !~* '^SEM\s*GTIN$' THEN
    SELECT p.id INTO pid
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.gtin) = v_gtin
      AND public.fz_normalize_code(p.gtin) !~* '^SEM\s*GTIN$'
    LIMIT 1;
    SELECT count(*) INTO cnt
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.gtin) = v_gtin
      AND public.fz_normalize_code(p.gtin) !~* '^SEM\s*GTIN$';
    IF cnt = 1 THEN RETURN pid; END IF;
  END IF;

  IF p_supplier_id IS NOT NULL AND v_cprod IS NOT NULL THEN
    SELECT ps.product_id INTO pid
    FROM public.product_suppliers ps
    WHERE ps.company_id = p_company_id
      AND ps.supplier_id = p_supplier_id
      AND public.fz_normalize_code(ps.supplier_sku) = v_cprod
    LIMIT 1;
    SELECT count(*) INTO cnt
    FROM public.product_suppliers ps
    WHERE ps.company_id = p_company_id
      AND ps.supplier_id = p_supplier_id
      AND public.fz_normalize_code(ps.supplier_sku) = v_cprod;
    IF cnt = 1 THEN RETURN pid; END IF;
  END IF;

  IF v_sku IS NOT NULL OR v_cprod IS NOT NULL THEN
    SELECT p.id INTO pid
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.sku) IN (v_sku, v_cprod)
    LIMIT 1;
    SELECT count(*) INTO cnt
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.sku) IN (v_sku, v_cprod);
    IF cnt = 1 THEN RETURN pid; END IF;
  END IF;

  IF v_ext IS NOT NULL THEN
    SELECT p.id INTO pid
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.external_id) = v_ext
    LIMIT 1;
    SELECT count(*) INTO cnt
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.external_id) = v_ext;
    IF cnt = 1 THEN RETURN pid; END IF;
  END IF;

  IF v_name IS NOT NULL AND v_name <> '' THEN
    SELECT p.id INTO pid
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND lower(trim(regexp_replace(p.name, '\s+', ' ', 'g'))) = v_name
    LIMIT 1;
    SELECT count(*) INTO cnt
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND lower(trim(regexp_replace(p.name, '\s+', ' ', 'g'))) = v_name;
    IF cnt = 1 THEN RETURN pid; END IF;
  END IF;

  RETURN NULL;
END;
$$;
```

- [ ] **Step 2: Testes SQL manuais (fixtures)**

```sql
SELECT public.fz_is_purchase_return('{"natureza":"DEVOLUCAO DE COMPRA"}'::jsonb); -- true
SELECT public.fz_is_purchase_return('{"natureza":"COMPRA PARA COMERCIALIZACAO"}'::jsonb); -- false
SELECT public.fz_normalize_digits('02.592.961/0002-49'); -- 02592961000249
```

Expected: conforme comentários.

- [ ] **Step 3: Commit (só se o usuário pedir)** — pode ir junto com Task 3 no mesmo arquivo/migration.

---

### Task 3: RPC `import_purchase_nfe`

**Files:**
- Create/continue: `supabase/migrations/20260804221000_feature_012_import_purchase_nfe_rpc.sql`

**Interfaces:**
- Consumes: helpers Task 2
- Produces: `public.import_purchase_nfe(p_company_id uuid, p_payload jsonb) → jsonb`

Payload shape (n8n deve enviar exatamente isto):

```json
{
  "external_id": "43260702592961000249550010002575691922492740",
  "invoice_number": "257569",
  "invoice_series": "1",
  "issued_at": "2026-07-29",
  "natureza": "VENDA DE MERCADORIAS",
  "cfops": "6102",
  "supplier": { "document": "02592961000249", "name": "VINHOS DO MUNDO..." },
  "items": [
    {
      "line_key": "1",
      "gtin": "6001660003824",
      "supplier_product_code": "004254",
      "sku": null,
      "name": "CHARDONNAY...",
      "quantity": 6,
      "unit_cost": 252.49
    }
  ]
}
```

Return examples:

```json
{ "status": "confirmed", "purchase_id": "...", "matched_items": 42, "unbound_items": 0 }
{ "status": "draft", "purchase_id": "...", "matched_items": 41, "unbound_items": 1 }
{ "status": "skipped_duplicate" }
{ "status": "rejected_return" }
{ "status": "error", "message": "..." }
```

- [ ] **Step 1: Implementar RPC**

```sql
CREATE OR REPLACE FUNCTION public.import_purchase_nfe(
  p_company_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chave text := public.fz_normalize_digits(p_payload->>'external_id');
  v_supplier_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_purchase_id uuid;
  v_matched int := 0;
  v_unbound int := 0;
  v_status text;
  v_total numeric := 0;
  v_existing uuid;
  v_items jsonb;
  v_i int;
BEGIN
  IF p_company_id IS NULL OR v_chave IS NULL OR length(v_chave) <> 44 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'company_id ou chave NFe inválidos');
  END IF;

  IF public.fz_is_purchase_return(p_payload) THEN
    RETURN jsonb_build_object('status', 'rejected_return');
  END IF;

  SELECT id INTO v_existing
  FROM public.purchases
  WHERE company_id = p_company_id
    AND source = 'bling'
    AND external_id = v_chave;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'skipped_duplicate', 'purchase_id', v_existing);
  END IF;

  v_items := coalesce(p_payload->'items', '[]'::jsonb);
  IF jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'NFe sem itens');
  END IF;

  v_supplier_id := public.fz_match_supplier(
    p_company_id,
    p_payload#>>'{supplier,document}'
  );

  -- pré-scan match
  FOR v_i IN 0 .. jsonb_array_length(v_items) - 1 LOOP
    v_item := v_items->v_i;
    v_product_id := public.fz_match_product(p_company_id, v_supplier_id, v_item);
    IF v_product_id IS NULL THEN
      v_unbound := v_unbound + 1;
    ELSE
      v_matched := v_matched + 1;
    END IF;
    v_total := v_total + round(
      (coalesce(v_item->>'quantity', '0'))::numeric
      * (coalesce(v_item->>'unit_cost', '0'))::numeric,
      2
    );
  END LOOP;

  v_status := CASE
    WHEN v_supplier_id IS NOT NULL AND v_unbound = 0 THEN 'confirmed'
    ELSE 'draft'
  END;

  IF v_status = 'confirmed' AND v_supplier_id IS NULL THEN
    v_status := 'draft';
  END IF;

  -- draft exige supplier no app; se sem supplier, ainda cria draft com supplier obrigatório?
  -- purchases.supplier_id é NOT NULL no schema 009 → exigir supplier ou rejeitar
  IF v_supplier_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Fornecedor não localizado pelo CNPJ; cadastre document no fornecedor',
      'matched_items', v_matched,
      'unbound_items', v_unbound
    );
  END IF;

  INSERT INTO public.purchases (
    company_id, supplier_id, issued_at, invoice_number, invoice_series,
    total_amount, status, source, external_id
  ) VALUES (
    p_company_id,
    v_supplier_id,
    coalesce((p_payload->>'issued_at')::date, current_date),
    nullif(p_payload->>'invoice_number', ''),
    nullif(p_payload->>'invoice_series', ''),
    v_total,
    v_status,
    'bling',
    v_chave
  )
  RETURNING id INTO v_purchase_id;

  FOR v_i IN 0 .. jsonb_array_length(v_items) - 1 LOOP
    v_item := v_items->v_i;
    v_product_id := public.fz_match_product(p_company_id, v_supplier_id, v_item);
    IF v_product_id IS NULL THEN
      CONTINUE; -- draft: itens sem produto não entram (revisão manual adiciona)
      -- Alternativa spec: criar linhas só matched; UI mostra parcial.
    END IF;
    INSERT INTO public.purchase_items (
      company_id, purchase_id, product_id, quantity, unit_cost
    ) VALUES (
      p_company_id,
      v_purchase_id,
      v_product_id,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_cost')::numeric
    );
  END LOOP;

  -- Se draft com unbound, purchase pode ter menos itens que a NF — ok para MVP.
  -- Se confirmed, todos os itens foram inseridos.

  RETURN jsonb_build_object(
    'status', v_status,
    'purchase_id', v_purchase_id,
    'matched_items', v_matched,
    'unbound_items', v_unbound
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status', 'skipped_duplicate');
END;
$$;

REVOKE ALL ON FUNCTION public.import_purchase_nfe(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_purchase_nfe(uuid, jsonb) TO service_role;
```

**Nota de produto (fixar no código se necessário):** se `supplier` casa mas 1 item não, status=`draft` e só itens matched são inseridos; usuário completa no sheet. Se preferir bloquear insert até 100%, mudar para `error`/`needs_review` sem insert — **MVP = insert parcial + draft** conforme acima.

- [ ] **Step 2: Testar RPC com payload da NFe Vinhos do Mundo (chave real de homologação)**

```sql
SELECT public.import_purchase_nfe(
  '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid,
  '{ ... payload mínimo 1 item com GTIN conhecido ... }'::jsonb
);
```

Expected: `confirmed` ou `draft` conforme catálogo; segunda chamada → `skipped_duplicate`.

- [ ] **Step 3: Commit (se usuário pedir)**

```bash
git add supabase/migrations/20260804221000_feature_012_import_purchase_nfe_rpc.sql
git commit -m "feat(012): RPC import_purchase_nfe for BLING entrada"
```

---

### Task 4: Trigger de estoque em confirm/cancel

**Files:**
- Create: `supabase/migrations/20260804222000_feature_012_purchase_stock_trigger.sql`

**Interfaces:**
- Consumes: `purchases`, `purchase_items`, `inventory_movements`
- Produces: `trg_purchase_stock_sync` on `purchases`

Convenção de movimento:

| Campo | Valor |
|-------|--------|
| `type` | `entrada` (confirm) |
| `reference_type` | `purchase` |
| `reference_id` | `{purchase_id}:{purchase_item_id}` |
| `quantity` | `purchase_items.quantity` |
| `company_id` / `product_id` | da linha |

- [ ] **Step 1: Antes de criar, listar triggers existentes**

```sql
SELECT c.relname, t.tgname, p.proname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND c.relname IN ('purchases', 'purchase_items');
```

Expected: anotar e **dropar** triggers legados que já escrevem `inventory_movements` em insert de draft (evitar duplicar).

- [ ] **Step 2: Criar function + trigger**

```sql
CREATE OR REPLACE FUNCTION public.fz_sync_purchase_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status = 'draft' AND NEW.status = 'confirmed' THEN
      INSERT INTO public.inventory_movements (
        company_id, product_id, quantity, type, reference_type, reference_id, created_at
      )
      SELECT
        NEW.company_id,
        pi.product_id,
        pi.quantity,
        'entrada',
        'purchase',
        NEW.id::text || ':' || pi.id::text,
        now()
      FROM public.purchase_items pi
      WHERE pi.purchase_id = NEW.id
      ON CONFLICT (company_id, product_id, reference_type, reference_id)
      DO UPDATE SET quantity = EXCLUDED.quantity;
    ELSIF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
      DELETE FROM public.inventory_movements
      WHERE company_id = NEW.company_id
        AND reference_type = 'purchase'
        AND reference_id LIKE NEW.id::text || ':%';
    END IF;
  END IF;

  -- Insert já confirmed (RPC)
  IF TG_OP = 'INSERT' AND NEW.status = 'confirmed' THEN
    INSERT INTO public.inventory_movements (
      company_id, product_id, quantity, type, reference_type, reference_id, created_at
    )
    SELECT
      NEW.company_id,
      pi.product_id,
      pi.quantity,
      'entrada',
      'purchase',
      NEW.id::text || ':' || pi.id::text,
      now()
    FROM public.purchase_items pi
    WHERE pi.purchase_id = NEW.id
    ON CONFLICT (company_id, product_id, reference_type, reference_id)
    DO UPDATE SET quantity = EXCLUDED.quantity;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_stock_sync ON public.purchases;
CREATE TRIGGER trg_purchase_stock_sync
AFTER INSERT OR UPDATE OF status ON public.purchases
FOR EACH ROW
EXECUTE FUNCTION public.fz_sync_purchase_stock();
```

**Atenção:** em `INSERT ... confirmed`, os `purchase_items` podem ainda não existir se o trigger rodar antes dos inserts de itens. Ordem na RPC: insert purchase como `draft`, insert items, depois `UPDATE status='confirmed'` **ou** chamar sync de estoque no fim da RPC. **Preferido:**

Na RPC Task 3: sempre inserir purchase como `draft` primeiro; inserir items; se 100% match, `UPDATE purchases SET status='confirmed' WHERE id=...` para disparar só o branch UPDATE do trigger.

Ajustar Task 3 nesse sentido ao implementar (não deixar insert já confirmed).

- [ ] **Step 3: Teste manual**

1. Criar purchase draft + 1 item via SQL.
2. `UPDATE purchases SET status='confirmed' WHERE id=...`
3. Verificar linha em `inventory_movements` com `type='entrada'`.
4. `UPDATE ... status='cancelled'` → movimento removido.

- [ ] **Step 4: Commit (se usuário pedir)**

```bash
git add supabase/migrations/20260804222000_feature_012_purchase_stock_trigger.sql
git commit -m "feat(012): purchase confirm/cancel stock trigger"
```

---

### Task 5: n8n workflow `farol-bling-sync-compras`

**Files:**
- Create: `n8n/farol-bling-sync-compras.json`
- Modify: `n8n/README-bling-sync.md`

**Interfaces:**
- Consumes: BLING `GET /nfe?tipo=0` + detalhe; RPC `import_purchase_nfe`
- Produces: log agregado no nó Resultado

- [ ] **Step 1: Clonar estrutura de `farol-bling-sync-vendas.json`**

Config inicial do workflow (nó Set/Config):

```javascript
{
  company_id: '04c9b2c3-1c6e-439b-949a-486e4917b13c',
  supabase_url: 'https://ilrebasidmyltziuibyc.supabase.co',
  bling_base_url: 'https://www.bling.com.br/Api/v3',
  nfe_tipo: 0,
  // sem filtro de série de venda; entradas usam séries do fornecedor
  nfe_series: '', // vazio = aceitar qualquer série
  dias_janela: 14,
  nfe_max_detalhe: 400,
  modo_teste: 0
}
```

- [ ] **Step 2: Mapear detalhe BLING → payload RPC**

No Code node após detalhe:

```javascript
// Pseudocódigo — adaptar aos campos reais do GET /nfe/{id}
const nfe = item.json.data ?? item.json;
const chave = String(nfe.chaveAcesso ?? nfe.chave ?? '').replace(/\D/g, '');
const emit = nfe.contato ?? nfe.emitente ?? {};
const itens = (nfe.itens ?? nfe.volumes ?? []).map((it, idx) => ({
  line_key: String(idx + 1),
  gtin: it.gtin || it.codigoBarras || null,
  supplier_product_code: it.codigo || null,
  sku: null,
  name: it.descricao || it.nome || null,
  quantity: Number(it.quantidade ?? 0),
  unit_cost: Number(it.valor || it.valorUnitario || 0),
}));
const cfops = [...new Set(itens.map(() => it.cfop).filter(Boolean))].join(',');
return [{
  json: {
    company_id: cfg.company_id,
    payload: {
      external_id: chave,
      invoice_number: String(nfe.numero ?? ''),
      invoice_series: String(nfe.serie ?? ''),
      issued_at: String(nfe.dataEmissao ?? '').slice(0, 10),
      natureza: nfe.naturezaOperacao || nfe.natureza || '',
      cfops,
      supplier: {
        document: String(emit.numeroDocumento || emit.cnpj || '').replace(/\D/g, ''),
        name: emit.nome || emit.razaoSocial || null,
      },
      items: itens,
    },
  },
}];
```

- [ ] **Step 3: Chamar RPC**

HTTP Request:

- Method: `POST`
- URL: `{{supabase_url}}/rest/v1/rpc/import_purchase_nfe`
- Headers: `apikey` + `Authorization: Bearer` service_role; `Content-Type: application/json`
- Body:

```json
{
  "p_company_id": "{{company_id}}",
  "p_payload": {{payload}}
}
```

- [ ] **Step 4: Agregar resultado** (`confirmed` / `draft` / `skipped_duplicate` / `rejected_return` / `error`)

- [ ] **Step 5: Documentar em `n8n/README-bling-sync.md`**

Tabela workflows: adicionar linha `farol-bling-sync-compras.json` | NF-e entrada → RPC compras | a cada 4h.

- [ ] **Step 6: Importar no n8n live e dry-run com `modo_teste` / 1 nota**

Expected: compra aparece na aba Compras; se match 100%, confirmed + movimento `entrada`.

- [ ] **Step 7: Commit (se usuário pedir)**

```bash
git add n8n/farol-bling-sync-compras.json n8n/README-bling-sync.md
git commit -m "feat(012): n8n sync BLING NFe entrada to import_purchase_nfe"
```

---

### Task 6: App — confirm manual usa o mesmo estoque + docs

**Files:**
- Verify: `src/hooks/usePurchases.ts` (`confirmPurchase` / `cancelPurchase` só mudam `status` — trigger faz o resto)
- Modify: `README.md` (FEATURES 001–012)

**Interfaces:**
- Consumes: trigger Task 4

- [ ] **Step 1: Verificar que `confirmPurchase` e `cancelPurchase` só atualizam `status`**

Não inserir movimentos no client.

- [ ] **Step 2: Teste UI**

1. Importar XML (011) → draft → Confirmar compra → checar `inventory_movements` tipo `entrada`.
2. Cancelar → movimentos da compra removidos.

- [ ] **Step 3: Atualizar README**

```markdown
12. **012** — Importação automática NFe entrada BLING → RPC `import_purchase_nfe` + estoque na confirmação
```

- [ ] **Step 4: Commit (se usuário pedir)**

```bash
git add README.md
git commit -m "docs(012): register FEATURE 012 in README"
```

---

### Task 7: Aceite e não-regressão

**Files:** nenhum obrigatório (checklist)

- [ ] **Step 1: Checklist aceite (spec)**

- [ ] Workflow n8n entradas cria `source=bling`
- [ ] Match 100% → confirmed + movimentos entrada
- [ ] Match incompleto → draft sem estoque (ou só itens matched)
- [ ] Devolução → `rejected_return`
- [ ] Duplicata → `skipped_duplicate`
- [ ] XML manual confirm → estoque
- [ ] Cancel confirmed → reverte estoque
- [ ] Sync vendas intacto; Farol sem mudança de views

- [ ] **Step 2: Não-regressão**

```bash
npx vitest run src/test/matchPurchaseImport.test.ts src/test/purchaseStatus.test.ts src/test/purchaseTotals.test.ts
npx tsc --noEmit
```

Expected: PASS / EXIT 0.

---

## Spec coverage (self-review)

| Spec | Task |
|------|------|
| n8n tipo=0, 14 dias | 5 |
| RPC no banco | 2–3 |
| Match 100% → confirmed | 3 |
| Incompleto → draft | 3 |
| Estoque na confirmação | 4 + 6 |
| Só compras / sem devolução | 2 (`fz_is_purchase_return`) + 5 |
| XML manual permanece | 6 |
| Dedupe chave | 3 |
| Schema company_id / total_cost / RLS movimentos | 1 |
| Fora: Farol/lista/pedido | Global Constraints |
| Cancel reverte estoque | 4 |

**Ajuste crítico na implementação:** RPC deve inserir purchase como `draft`, itens, depois `UPDATE` para `confirmed` (dispara estoque). Não inserir já `confirmed` antes dos itens.
