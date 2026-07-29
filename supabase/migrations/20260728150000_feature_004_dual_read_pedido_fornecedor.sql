-- FEATURE 004: dual-read do fornecedor na view de pedido
-- Prefere product_suppliers (is_primary + is_active); fallback products.supplier_id
-- Não altera stock_analysis nem farol_lista_compra (cálculo permanece igual)

DROP VIEW IF EXISTS public.farol_pedido_fornecedor;

CREATE VIEW public.farol_pedido_fornecedor AS
SELECT
  COALESCE(s.id, '00000000-0000-0000-0000-000000000000'::uuid) AS supplier_id,
  COALESCE(s.name, 'Sem fornecedor') AS supplier_name,
  sa.product_id,
  sa.product_name,
  sa.quantidade_sugerida,
  sa.status_farol,
  sa.estoque_atual,
  sa.consumo_dia,
  sa.dias_cobertura
FROM public.farol_lista_compra sa
JOIN public.products p ON p.id = sa.product_id
LEFT JOIN public.product_suppliers ps
  ON ps.product_id = p.id
 AND ps.company_id = p.company_id
 AND ps.is_primary = true
 AND ps.is_active = true
LEFT JOIN public.suppliers s
  ON s.id = COALESCE(ps.supplier_id, p.supplier_id)
ORDER BY supplier_name, sa.quantidade_sugerida DESC;

COMMENT ON VIEW public.farol_pedido_fornecedor IS
  'FEATURE 004: dual-read — fornecedor via product_suppliers primary, fallback products.supplier_id';
