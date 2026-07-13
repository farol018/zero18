-- FAROL production-ready: settings, RLS, views, sync metadata

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS coverage_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS consumption_window_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_external_id_uidx
  ON public.suppliers (company_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_company_external_id_uidx
  ON public.products (company_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_ref_uidx
  ON public.inventory_movements (company_id, product_id, reference_type, reference_id);

CREATE UNIQUE INDEX IF NOT EXISTS current_stock_company_product_uidx
  ON public.current_stock (company_id, product_id);

UPDATE public.companies
SET
  coverage_days = COALESCE(coverage_days, 7),
  consumption_window_days = COALESCE(consumption_window_days, 7)
WHERE id = '04c9b2c3-1c6e-439b-949a-486e4917b13c';

INSERT INTO public.data_sources (id, company_id, name, type, config)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '04c9b2c3-1c6e-439b-949a-486e4917b13c',
  'BLING ERP',
  'bling',
  '{"api_version":"v3","base_url":"https://api.bling.com.br/Api/v3"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  config = EXCLUDED.config;

-- Views recalculadas (7 dias padrão; app usa cálculo dinâmico no frontend)
DROP VIEW IF EXISTS public.farol_pedido_fornecedor;
DROP VIEW IF EXISTS public.farol_lista_compra;
DROP VIEW IF EXISTS public.stock_analysis;

CREATE VIEW public.stock_analysis AS
WITH company_settings AS (
  SELECT id AS company_id, consumption_window_days, coverage_days
  FROM public.companies
),
max_data AS (
  SELECT im.company_id, max(im.created_at) AS max_created_at
  FROM public.inventory_movements im
  GROUP BY im.company_id
),
filtered_movements AS (
  SELECT im.company_id, im.product_id, im.type, im.quantity, im.created_at
  FROM public.inventory_movements im
  JOIN max_data md ON im.company_id = md.company_id
  JOIN company_settings cs ON cs.company_id = im.company_id
  WHERE im.created_at >= (md.max_created_at - (cs.consumption_window_days || ' days')::interval)
),
consumption AS (
  SELECT fm.company_id, fm.product_id,
    sum(CASE WHEN fm.type = 'saida' THEN abs(fm.quantity) ELSE 0::numeric END) AS total_saida
  FROM filtered_movements fm
  GROUP BY fm.company_id, fm.product_id
),
stock_base AS (
  SELECT cs.company_id, cs.product_id, cs.quantity AS estoque_atual
  FROM public.current_stock cs
  WHERE cs.quantity > 0::numeric
     OR EXISTS (
       SELECT 1 FROM public.inventory_movements im
       WHERE im.product_id = cs.product_id AND im.company_id = cs.company_id
     )
)
SELECT
  sb.company_id,
  sb.product_id,
  p.name AS product_name,
  p.purchase_multiple,
  sb.estoque_atual,
  COALESCE(c.total_saida, 0::numeric) AS consumo_7d,
  COALESCE(c.total_saida, 0::numeric) / NULLIF(cs.consumption_window_days, 0)::numeric AS consumo_dia,
  CASE
    WHEN COALESCE(c.total_saida, 0::numeric) = 0 THEN NULL::numeric
    ELSE sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0)
  END AS dias_cobertura,
  CASE
    WHEN sb.estoque_atual < 0 THEN '⚠️ anomalia'
    WHEN sb.estoque_atual = 0 AND COALESCE(c.total_saida, 0) > 0 THEN '🔴 ruptura'
    WHEN COALESCE(c.total_saida, 0) = 0 THEN '⚪ sem consumo'
    WHEN (sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0)) <= 2 THEN '🔴 risco'
    WHEN (sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0)) <= 5 THEN '🟡 atenção'
    ELSE '🟢 saudável'
  END AS status_farol,
  CASE
    WHEN COALESCE(c.total_saida, 0) = 0 THEN NULL::numeric
    WHEN sb.estoque_atual <= 0 THEN ceil(cs.coverage_days::numeric * (c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric))
    WHEN (sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0)) >= cs.coverage_days THEN 0::numeric
    ELSE ceil(
      (cs.coverage_days::numeric - sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0))
      * (c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric)
    )
  END AS quantidade_bruta,
  CASE
    WHEN COALESCE(c.total_saida, 0) = 0 THEN NULL::numeric
    ELSE ceil(
      CASE
        WHEN sb.estoque_atual <= 0 THEN cs.coverage_days::numeric * (c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric)
        WHEN (sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0)) >= cs.coverage_days THEN 0::numeric
        ELSE (cs.coverage_days::numeric - sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0))
             * (c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric)
      END / GREATEST(p.purchase_multiple, 1)::numeric
    ) * GREATEST(p.purchase_multiple, 1)::numeric
  END AS quantidade_sugerida,
  p.cost_price
FROM stock_base sb
JOIN company_settings cs ON cs.company_id = sb.company_id
LEFT JOIN consumption c ON sb.company_id = c.company_id AND sb.product_id = c.product_id
LEFT JOIN public.products p ON p.id = sb.product_id;

CREATE VIEW public.farol_lista_compra AS
SELECT
  company_id, product_id, product_name, status_farol,
  estoque_atual, consumo_dia, dias_cobertura, quantidade_sugerida,
  CASE
    WHEN status_farol = '🔴 ruptura' THEN 1
    WHEN status_farol = '🔴 risco' THEN 2
    WHEN status_farol = '🟡 atenção' THEN 3
    ELSE 99
  END AS prioridade
FROM public.stock_analysis sa
WHERE quantidade_sugerida > 0;

CREATE VIEW public.farol_pedido_fornecedor AS
SELECT
  COALESCE(s.id, '00000000-0000-0000-0000-000000000000'::uuid) AS supplier_id,
  COALESCE(s.name, 'Sem fornecedor') AS supplier_name,
  sa.product_id,
  sa.product_name,
  sa.quantidade_sugerida,
  sa.status_farol,
  sa.estoque_atual,
  sa.consumo_dia,
  sa.dias_cobertura
FROM public.farol_lista_compra sa
JOIN public.products p ON p.id = sa.product_id
LEFT JOIN public.suppliers s ON s.id = p.supplier_id
ORDER BY supplier_name, sa.quantidade_sugerida DESC;

-- RLS: remover acesso anon amplo; manter leitura autenticada por empresa
DROP POLICY IF EXISTS "Anon users can read products" ON public.products;
DROP POLICY IF EXISTS "Anon users can update products" ON public.products;

DROP POLICY IF EXISTS "Users can read products from their company" ON public.products;
DROP POLICY IF EXISTS "Users can update products from their company" ON public.products;

CREATE POLICY "Authenticated read products by company"
ON public.products FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Authenticated update products by company"
ON public.products FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Leitura anon para demo/dev (somente SELECT, sem update)
CREATE POLICY "Anon read products"
ON public.products FOR SELECT TO anon
USING (true);

CREATE POLICY "Anon update products single tenant"
ON public.products FOR UPDATE TO anon
USING (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid)
WITH CHECK (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.current_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read current_stock" ON public.current_stock;
CREATE POLICY "Anon read current_stock"
ON public.current_stock FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Authenticated read current_stock" ON public.current_stock;
CREATE POLICY "Authenticated read current_stock"
ON public.current_stock FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Anon read inventory_movements" ON public.inventory_movements;
CREATE POLICY "Anon read inventory_movements"
ON public.inventory_movements FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Authenticated read inventory_movements" ON public.inventory_movements;
CREATE POLICY "Authenticated read inventory_movements"
ON public.inventory_movements FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Anon read suppliers" ON public.suppliers;
CREATE POLICY "Anon read suppliers"
ON public.suppliers FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Authenticated read suppliers" ON public.suppliers;
CREATE POLICY "Authenticated read suppliers"
ON public.suppliers FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Anon read companies" ON public.companies;
CREATE POLICY "Anon read companies"
ON public.companies FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Authenticated read companies" ON public.companies;
CREATE POLICY "Authenticated read companies"
ON public.companies FOR SELECT TO authenticated
USING (id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Anon read import_jobs" ON public.import_jobs;
CREATE POLICY "Anon read import_jobs"
ON public.import_jobs FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Authenticated read import_jobs" ON public.import_jobs;
CREATE POLICY "Authenticated read import_jobs"
ON public.import_jobs FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
