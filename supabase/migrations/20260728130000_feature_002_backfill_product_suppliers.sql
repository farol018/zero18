-- FEATURE 002: backfill product_suppliers a partir de products.supplier_id
-- Idempotente: não cria duplicados (ON CONFLICT DO NOTHING)
-- Não altera frontend, views, funções SQL, n8n nem products.supplier_id

INSERT INTO public.product_suppliers (
  company_id,
  product_id,
  supplier_id,
  is_primary,
  is_active,
  purchase_multiple,
  cost_price,
  source,
  created_at,
  updated_at
)
SELECT
  p.company_id,
  p.id AS product_id,
  p.supplier_id,
  true AS is_primary,
  true AS is_active,
  GREATEST(COALESCE(p.purchase_multiple, 1), 1) AS purchase_multiple,
  p.cost_price,
  'migration' AS source,
  now() AS created_at,
  now() AS updated_at
FROM public.products p
WHERE p.supplier_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.suppliers s
    WHERE s.id = p.supplier_id
      AND s.company_id = p.company_id
  )
ON CONFLICT (company_id, product_id, supplier_id) DO NOTHING;
