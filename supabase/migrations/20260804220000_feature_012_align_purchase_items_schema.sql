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
