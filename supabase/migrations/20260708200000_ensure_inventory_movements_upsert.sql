-- Garante constraint UNIQUE para upsert do workflow de vendas (PostgREST exige CONSTRAINT, não só INDEX)

DROP INDEX IF EXISTS public.inventory_movements_ref_uidx;

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_ref_key;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_ref_key
  UNIQUE (company_id, product_id, reference_type, reference_id);
