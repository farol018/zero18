-- FEATURE 010: Logística Inteligente de Compra
-- Camada desacoplada — não altera views Farol, motor, purchases, product_suppliers.

CREATE TABLE IF NOT EXISTS public.product_logistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  unit_name text NOT NULL,
  base_units integer NOT NULL,
  level_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_logistics_base_units_check CHECK (base_units > 0),
  CONSTRAINT product_logistics_company_product_unit_name_key
    UNIQUE (company_id, product_id, unit_name),
  CONSTRAINT product_logistics_company_product_base_units_key
    UNIQUE (company_id, product_id, base_units)
);

CREATE INDEX IF NOT EXISTS product_logistics_company_product_active_idx
  ON public.product_logistics (company_id, product_id, active);

CREATE INDEX IF NOT EXISTS product_logistics_product_id_idx
  ON public.product_logistics (product_id);

ALTER TABLE public.product_logistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read product_logistics" ON public.product_logistics;
CREATE POLICY "Authenticated read product_logistics"
ON public.product_logistics FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated insert product_logistics" ON public.product_logistics;
CREATE POLICY "Authenticated insert product_logistics"
ON public.product_logistics FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated update product_logistics" ON public.product_logistics;
CREATE POLICY "Authenticated update product_logistics"
ON public.product_logistics FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated delete product_logistics" ON public.product_logistics;
CREATE POLICY "Authenticated delete product_logistics"
ON public.product_logistics FOR DELETE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
