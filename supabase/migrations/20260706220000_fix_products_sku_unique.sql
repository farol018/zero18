-- SKU no BLING não é único (variações, pais/filhos). Chave de sync = external_id.

DROP INDEX IF EXISTS public.idx_products_sku_unique;
DROP INDEX IF EXISTS public.products_company_sku_uidx;

CREATE INDEX IF NOT EXISTS products_company_sku_idx
  ON public.products (company_id, sku)
  WHERE sku IS NOT NULL AND btrim(sku) <> '';
