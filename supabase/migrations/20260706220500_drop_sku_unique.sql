-- Se já rodou a migration anterior com UNIQUE em sku, execute só isto:

DROP INDEX IF EXISTS public.products_company_sku_uidx;
DROP INDEX IF EXISTS public.idx_products_sku_unique;

CREATE INDEX IF NOT EXISTS products_company_sku_idx
  ON public.products (company_id, sku)
  WHERE sku IS NOT NULL AND btrim(sku) <> '';
