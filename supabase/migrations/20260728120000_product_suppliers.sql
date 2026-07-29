-- FEATURE 001: product_suppliers (fundação do Motor de Abastecimento)
-- Etapa 0: cria a tabela sem alterar comportamento atual
-- Etapa 1: backfill a partir de products.supplier_id
-- Não altera views, frontend nem workflows n8n.

CREATE TABLE IF NOT EXISTS public.product_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  supplier_sku text,
  lead_time_days integer,
  purchase_multiple numeric NOT NULL DEFAULT 1,
  cost_price numeric,
  min_order_qty numeric,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_suppliers_company_product_supplier_key
    UNIQUE (company_id, product_id, supplier_id),
  CONSTRAINT product_suppliers_purchase_multiple_positive
    CHECK (purchase_multiple >= 1),
  CONSTRAINT product_suppliers_lead_time_nonnegative
    CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  CONSTRAINT product_suppliers_min_order_qty_positive
    CHECK (min_order_qty IS NULL OR min_order_qty > 0)
);

-- No máximo 1 fornecedor principal por produto (por empresa)
CREATE UNIQUE INDEX IF NOT EXISTS product_suppliers_one_primary_per_product_uidx
  ON public.product_suppliers (company_id, product_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS product_suppliers_company_product_idx
  ON public.product_suppliers (company_id, product_id);

CREATE INDEX IF NOT EXISTS product_suppliers_company_supplier_idx
  ON public.product_suppliers (company_id, supplier_id);

CREATE INDEX IF NOT EXISTS product_suppliers_primary_active_idx
  ON public.product_suppliers (company_id, product_id)
  WHERE is_primary = true AND is_active = true;

-- RLS alinhado às demais tabelas operacionais
ALTER TABLE public.product_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read product_suppliers" ON public.product_suppliers;
CREATE POLICY "Anon read product_suppliers"
ON public.product_suppliers FOR SELECT TO anon
USING (true);

DROP POLICY IF EXISTS "Authenticated read product_suppliers" ON public.product_suppliers;
CREATE POLICY "Authenticated read product_suppliers"
ON public.product_suppliers FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Etapa 1: backfill — materializa o modelo novo sem mudar leituras atuais
INSERT INTO public.product_suppliers (
  company_id,
  product_id,
  supplier_id,
  is_primary,
  is_active,
  purchase_multiple,
  cost_price,
  source,
  created_at,
  updated_at
)
SELECT
  p.company_id,
  p.id AS product_id,
  p.supplier_id,
  true AS is_primary,
  true AS is_active,
  GREATEST(COALESCE(p.purchase_multiple, 1), 1) AS purchase_multiple,
  p.cost_price,
  'migration' AS source,
  now() AS created_at,
  now() AS updated_at
FROM public.products p
WHERE p.supplier_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.suppliers s
    WHERE s.id = p.supplier_id
      AND s.company_id = p.company_id
  )
ON CONFLICT (company_id, product_id, supplier_id) DO NOTHING;
