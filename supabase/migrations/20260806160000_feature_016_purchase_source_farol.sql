-- FEATURE 016: allow purchases.source = 'farol'

ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_source_check;
ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_source_check
  CHECK (source IN ('manual', 'xml', 'csv', 'bling', 'farol'));
