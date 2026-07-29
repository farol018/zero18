-- FEATURE 009 (corrigida no Sprint 0): Fundação do Módulo de Compras
-- Idempotente. SEM DROP TABLE. Seguro para ambientes com ou sem stub legado.
-- Não altera motor, views, product_suppliers (exceto FK nullable em items), lista, n8n, BI.

-- ---------------------------------------------------------------------------
-- purchases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  issued_at date NOT NULL DEFAULT (CURRENT_DATE),
  received_at date,
  invoice_number text,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Migrar stub legado (purchase_date / total) sem DROP
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'purchase_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'issued_at'
  ) THEN
    ALTER TABLE public.purchases RENAME COLUMN purchase_date TO issued_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'total'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'total_amount'
  ) THEN
    ALTER TABLE public.purchases RENAME COLUMN total TO total_amount;
  END IF;
END $$;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS issued_at date,
  ADD COLUMN IF NOT EXISTS received_at date,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS total_amount numeric,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.purchases
  SET issued_at = COALESCE(issued_at, CURRENT_DATE)
  WHERE issued_at IS NULL;

UPDATE public.purchases
  SET total_amount = COALESCE(total_amount, 0)
  WHERE total_amount IS NULL;

UPDATE public.purchases
  SET status = COALESCE(status, 'draft')
  WHERE status IS NULL;

UPDATE public.purchases
  SET source = COALESCE(source, 'manual')
  WHERE source IS NULL;

UPDATE public.purchases
  SET updated_at = COALESCE(updated_at, now())
  WHERE updated_at IS NULL;

ALTER TABLE public.purchases
  ALTER COLUMN issued_at SET DEFAULT CURRENT_DATE,
  ALTER COLUMN issued_at SET NOT NULL,
  ALTER COLUMN total_amount SET DEFAULT 0,
  ALTER COLUMN total_amount SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'manual',
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchases_status_check'
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_status_check
      CHECK (status IN ('draft', 'confirmed', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchases_source_check'
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_source_check
      CHECK (source IN ('manual', 'xml', 'csv', 'bling'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS purchases_company_source_external_id_uidx
  ON public.purchases (company_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchases_company_issued_at_idx
  ON public.purchases (company_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS purchases_company_status_idx
  ON public.purchases (company_id, status);

CREATE INDEX IF NOT EXISTS purchases_company_supplier_idx
  ON public.purchases (company_id, supplier_id);

-- ---------------------------------------------------------------------------
-- purchase_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_supplier_id uuid REFERENCES public.product_suppliers(id) ON DELETE SET NULL,
  quantity numeric NOT NULL,
  unit_cost numeric NOT NULL,
  total_cost numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_items' AND column_name = 'unit_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_items' AND column_name = 'unit_cost'
  ) THEN
    ALTER TABLE public.purchase_items RENAME COLUMN unit_price TO unit_cost;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_items' AND column_name = 'total_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_items' AND column_name = 'total_cost'
  ) THEN
    ALTER TABLE public.purchase_items RENAME COLUMN total_price TO total_cost;
  END IF;
END $$;

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS product_supplier_id uuid,
  ADD COLUMN IF NOT EXISTS unit_cost numeric,
  ADD COLUMN IF NOT EXISTS total_cost numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_items_product_supplier_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_items' AND column_name = 'product_supplier_id'
  ) THEN
    ALTER TABLE public.purchase_items
      ADD CONSTRAINT purchase_items_product_supplier_id_fkey
      FOREIGN KEY (product_supplier_id)
      REFERENCES public.product_suppliers(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_quantity_check'
  ) THEN
    ALTER TABLE public.purchase_items
      ADD CONSTRAINT purchase_items_quantity_check CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_unit_cost_check'
  ) THEN
    ALTER TABLE public.purchase_items
      ADD CONSTRAINT purchase_items_unit_cost_check CHECK (unit_cost >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS purchase_items_purchase_id_idx
  ON public.purchase_items (purchase_id);

CREATE INDEX IF NOT EXISTS purchase_items_product_id_idx
  ON public.purchase_items (product_id);

CREATE INDEX IF NOT EXISTS purchase_items_product_supplier_id_idx
  ON public.purchase_items (product_supplier_id)
  WHERE product_supplier_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS (authenticated only — policies anon removidas no Sprint 0)
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read purchases" ON public.purchases;
DROP POLICY IF EXISTS "Anon insert purchases single tenant" ON public.purchases;
DROP POLICY IF EXISTS "Anon update purchases single tenant" ON public.purchases;
DROP POLICY IF EXISTS "Anon delete purchases single tenant" ON public.purchases;

DROP POLICY IF EXISTS "Authenticated read purchases" ON public.purchases;
CREATE POLICY "Authenticated read purchases"
ON public.purchases FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated insert purchases by company" ON public.purchases;
CREATE POLICY "Authenticated insert purchases by company"
ON public.purchases FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated update purchases by company" ON public.purchases;
CREATE POLICY "Authenticated update purchases by company"
ON public.purchases FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated delete purchases by company" ON public.purchases;
CREATE POLICY "Authenticated delete purchases by company"
ON public.purchases FOR DELETE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Anon read purchase_items" ON public.purchase_items;
DROP POLICY IF EXISTS "Anon insert purchase_items single tenant" ON public.purchase_items;
DROP POLICY IF EXISTS "Anon update purchase_items single tenant" ON public.purchase_items;
DROP POLICY IF EXISTS "Anon delete purchase_items single tenant" ON public.purchase_items;

DROP POLICY IF EXISTS "Authenticated read purchase_items" ON public.purchase_items;
CREATE POLICY "Authenticated read purchase_items"
ON public.purchase_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_id
      AND p.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated insert purchase_items by company" ON public.purchase_items;
CREATE POLICY "Authenticated insert purchase_items by company"
ON public.purchase_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_id
      AND p.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated update purchase_items by company" ON public.purchase_items;
CREATE POLICY "Authenticated update purchase_items by company"
ON public.purchase_items FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_id
      AND p.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_id
      AND p.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated delete purchase_items by company" ON public.purchase_items;
CREATE POLICY "Authenticated delete purchase_items by company"
ON public.purchase_items FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_id
      AND p.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
);
