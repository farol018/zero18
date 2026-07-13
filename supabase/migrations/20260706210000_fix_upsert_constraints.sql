-- Fix: PostgREST upsert exige CONSTRAINT UNIQUE (índice parcial não basta)

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS external_id text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS external_id text;

-- Remove índices parciais antigos (se existirem)
DROP INDEX IF EXISTS public.suppliers_company_external_id_uidx;
DROP INDEX IF EXISTS public.products_company_external_id_uidx;

-- Constraints para on_conflict=company_id,external_id
ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_company_external_id_key;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_company_external_id_key;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_company_external_id_key
  UNIQUE (company_id, external_id);

ALTER TABLE public.products
  ADD CONSTRAINT products_company_external_id_key
  UNIQUE (company_id, external_id);

-- current_stock upsert
ALTER TABLE public.current_stock
  DROP CONSTRAINT IF EXISTS current_stock_company_product_key;

ALTER TABLE public.current_stock
  ADD CONSTRAINT current_stock_company_product_key
  UNIQUE (company_id, product_id);

-- inventory_movements upsert (workflow vendas)
DROP INDEX IF EXISTS public.inventory_movements_ref_uidx;

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_ref_key;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_ref_key
  UNIQUE (company_id, product_id, reference_type, reference_id);

-- Verificar
SELECT conname, conrelid::regclass AS tabela
FROM pg_constraint
WHERE conname IN (
  'suppliers_company_external_id_key',
  'products_company_external_id_key',
  'current_stock_company_product_key',
  'inventory_movements_ref_key'
);
