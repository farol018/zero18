-- FEATURE 007: Estrutura comercial (brands + categories)
-- Compatível com BLING: marca = string; categoria = id externo + hierarquia
-- Não altera motor de abastecimento, views, triggers, n8n

CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brands_company_name_key UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS brands_company_active_idx
  ON public.brands (company_id)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  external_id text,
  name text NOT NULL,
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_company_external_id_key UNIQUE (company_id, external_id)
);

CREATE INDEX IF NOT EXISTS categories_company_active_idx
  ON public.categories (company_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS categories_company_parent_idx
  ON public.categories (company_id, parent_id);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_company_brand_idx
  ON public.products (company_id, brand_id)
  WHERE brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_company_category_idx
  ON public.products (company_id, category_id)
  WHERE category_id IS NOT NULL;

-- RLS brands
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read brands" ON public.brands;
CREATE POLICY "Anon read brands"
ON public.brands FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Authenticated read brands" ON public.brands;
CREATE POLICY "Authenticated read brands"
ON public.brands FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Anon write brands single tenant" ON public.brands;
CREATE POLICY "Anon insert brands single tenant"
ON public.brands FOR INSERT TO anon
WITH CHECK (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid);

CREATE POLICY "Anon update brands single tenant"
ON public.brands FOR UPDATE TO anon
USING (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid)
WITH CHECK (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid);

CREATE POLICY "Anon delete brands single tenant"
ON public.brands FOR DELETE TO anon
USING (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid);

DROP POLICY IF EXISTS "Authenticated write brands by company" ON public.brands;
CREATE POLICY "Authenticated insert brands by company"
ON public.brands FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Authenticated update brands by company"
ON public.brands FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Authenticated delete brands by company"
ON public.brands FOR DELETE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- RLS categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read categories" ON public.categories;
CREATE POLICY "Anon read categories"
ON public.categories FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Authenticated read categories" ON public.categories;
CREATE POLICY "Authenticated read categories"
ON public.categories FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Anon insert categories single tenant"
ON public.categories FOR INSERT TO anon
WITH CHECK (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid);

CREATE POLICY "Anon update categories single tenant"
ON public.categories FOR UPDATE TO anon
USING (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid)
WITH CHECK (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid);

CREATE POLICY "Anon delete categories single tenant"
ON public.categories FOR DELETE TO anon
USING (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid);

CREATE POLICY "Authenticated insert categories by company"
ON public.categories FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Authenticated update categories by company"
ON public.categories FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Authenticated delete categories by company"
ON public.categories FOR DELETE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

COMMENT ON TABLE public.brands IS
  'FEATURE 007: marcas — BLING envia apenas nome (string); normalizar por name';
COMMENT ON TABLE public.categories IS
  'FEATURE 007: categorias — sync futuro via /categorias/produtos (external_id + parent)';
COMMENT ON COLUMN public.products.brand_id IS
  'FEATURE 007: FK marca (preenchimento futuro via sync BLING marca string)';
COMMENT ON COLUMN public.products.category_id IS
  'FEATURE 007: FK categoria (preenchimento futuro via sync BLING categoria.id)';
