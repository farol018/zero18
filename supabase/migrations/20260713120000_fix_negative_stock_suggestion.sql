-- P0: sugestão com déficit quando estoque < 0
-- quantidade = coverage*consumo + |estoque_negativo|

DROP VIEW IF EXISTS public.farol_pedido_fornecedor;
DROP VIEW IF EXISTS public.farol_lista_compra;
DROP VIEW IF EXISTS public.stock_analysis;

CREATE VIEW public.stock_analysis AS
WITH company_settings AS (
  SELECT id AS company_id, consumption_window_days, coverage_days
  FROM public.companies
),
max_data AS (
  SELECT im.company_id, max(im.created_at) AS max_created_at
  FROM public.inventory_movements im
  GROUP BY im.company_id
),
filtered_movements AS (
  SELECT im.company_id, im.product_id, im.type, im.quantity, im.created_at
  FROM public.inventory_movements im
  JOIN max_data md ON im.company_id = md.company_id
  JOIN company_settings cs ON cs.company_id = im.company_id
  WHERE im.created_at >= (md.max_created_at - (cs.consumption_window_days || ' days')::interval)
),
consumption AS (
  SELECT fm.company_id, fm.product_id,
    sum(CASE WHEN fm.type = 'saida' THEN abs(fm.quantity) ELSE 0::numeric END) AS total_saida
  FROM filtered_movements fm
  GROUP BY fm.company_id, fm.product_id
),
stock_base AS (
  SELECT cs.company_id, cs.product_id, cs.quantity AS estoque_atual
  FROM public.current_stock cs
  WHERE cs.quantity > 0::numeric
     OR EXISTS (
       SELECT 1 FROM public.inventory_movements im
       WHERE im.product_id = cs.product_id AND im.company_id = cs.company_id
     )
),
calc AS (
  SELECT
    sb.company_id,
    sb.product_id,
    p.name AS product_name,
    p.purchase_multiple,
    sb.estoque_atual,
    COALESCE(c.total_saida, 0::numeric) AS consumo_7d,
    COALESCE(c.total_saida, 0::numeric) / NULLIF(cs.consumption_window_days, 0)::numeric AS consumo_dia,
    CASE
      WHEN COALESCE(c.total_saida, 0::numeric) = 0 THEN NULL::numeric
      ELSE sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0)
    END AS dias_cobertura,
    CASE
      WHEN sb.estoque_atual < 0 THEN '⚠️ anomalia'
      WHEN sb.estoque_atual = 0 AND COALESCE(c.total_saida, 0) > 0 THEN '🔴 ruptura'
      WHEN COALESCE(c.total_saida, 0) = 0 THEN '⚪ sem consumo'
      WHEN (sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0)) <= 2 THEN '🔴 risco'
      WHEN (sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0)) <= 5 THEN '🟡 atenção'
      ELSE '🟢 saudável'
    END AS status_farol,
    CASE
      WHEN COALESCE(c.total_saida, 0) = 0 THEN NULL::numeric
      WHEN sb.estoque_atual < 0 THEN
        cs.coverage_days::numeric * (c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric)
        + abs(sb.estoque_atual)
      WHEN sb.estoque_atual = 0 THEN
        cs.coverage_days::numeric * (c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric)
      WHEN (sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0)) >= cs.coverage_days THEN 0::numeric
      ELSE (cs.coverage_days::numeric - sb.estoque_atual / NULLIF(c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric, 0))
           * (c.total_saida / NULLIF(cs.consumption_window_days, 0)::numeric)
    END AS quantidade_bruta,
    p.cost_price,
    GREATEST(COALESCE(p.purchase_multiple, 1), 1)::numeric AS mult
  FROM stock_base sb
  JOIN company_settings cs ON cs.company_id = sb.company_id
  LEFT JOIN consumption c ON sb.company_id = c.company_id AND sb.product_id = c.product_id
  LEFT JOIN public.products p ON p.id = sb.product_id
)
SELECT
  company_id,
  product_id,
  product_name,
  purchase_multiple,
  estoque_atual,
  consumo_7d,
  consumo_dia,
  dias_cobertura,
  status_farol,
  quantidade_bruta,
  CASE
    WHEN quantidade_bruta IS NULL THEN NULL::numeric
    WHEN quantidade_bruta <= 0 THEN 0::numeric
    ELSE ceil(quantidade_bruta / mult) * mult
  END AS quantidade_sugerida,
  cost_price
FROM calc;

CREATE VIEW public.farol_lista_compra AS
SELECT
  company_id, product_id, product_name, status_farol,
  estoque_atual, consumo_dia, dias_cobertura, quantidade_sugerida,
  CASE
    WHEN status_farol = '🔴 ruptura' THEN 1
    WHEN status_farol = '🔴 risco' THEN 2
    WHEN status_farol = '🟡 atenção' THEN 3
    WHEN status_farol LIKE '%anomalia%' THEN 0
    ELSE 99
  END AS prioridade
FROM public.stock_analysis sa
WHERE quantidade_sugerida > 0;

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
LEFT JOIN public.suppliers s ON s.id = p.supplier_id
ORDER BY supplier_name, sa.quantidade_sugerida DESC;
