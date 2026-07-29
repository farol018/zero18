-- FEATURE 011: colunas para importação XML / futuro BLING
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS invoice_series text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS document text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gtin text;

CREATE INDEX IF NOT EXISTS suppliers_company_document_idx
  ON public.suppliers (company_id, document)
  WHERE document IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_company_gtin_idx
  ON public.products (company_id, gtin)
  WHERE gtin IS NOT NULL;
