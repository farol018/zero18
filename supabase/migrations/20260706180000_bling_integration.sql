-- Suporte a upsert idempotente BLING → Farol

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_external_id_uidx
  ON public.suppliers (company_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_company_external_id_uidx
  ON public.products (company_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_ref_uidx
  ON public.inventory_movements (company_id, product_id, reference_type, reference_id);

-- Fonte de dados BLING (id fixo para o cliente; ajuste se necessário)
INSERT INTO public.data_sources (id, company_id, name, type, config)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '04c9b2c3-1c6e-439b-949a-486e4917b13c',
  'BLING ERP',
  'bling',
  '{"api_version":"v3","base_url":"https://api.bling.com.br/Api/v3"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  config = EXCLUDED.config;
