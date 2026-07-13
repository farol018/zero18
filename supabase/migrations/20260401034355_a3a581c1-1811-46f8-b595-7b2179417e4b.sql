DROP VIEW IF EXISTS public.farol_pedido_fornecedor;
DROP VIEW IF EXISTS public.farol_lista_compra;
DROP VIEW IF EXISTS public.stock_analysis;

CREATE VIEW public.stock_analysis AS
WITH max_data AS (
    SELECT inventory_movements.company_id,
        max(inventory_movements.created_at) AS max_created_at
    FROM inventory_movements
    GROUP BY inventory_movements.company_id
), filtered_movements AS (
    SELECT im.id, im.company_id, im.product_id, im.type, im.quantity,
        im.reference_id, im.reference_type, im.created_at, im.external_reference
    FROM inventory_movements im
        JOIN max_data md ON im.company_id = md.company_id
    WHERE im.created_at >= (md.max_created_at - '7 days'::interval)
), consumption AS (
    SELECT filtered_movements.company_id, filtered_movements.product_id,
        sum(CASE WHEN filtered_movements.type = 'saida' THEN abs(filtered_movements.quantity) ELSE 0::numeric END) AS total_saida
    FROM filtered_movements
    GROUP BY filtered_movements.company_id, filtered_movements.product_id
), stock_base AS (
    SELECT cs.company_id, cs.product_id, cs.quantity AS estoque_atual
    FROM current_stock cs
    WHERE cs.quantity > 0::numeric OR EXISTS (SELECT 1 FROM inventory_movements im WHERE im.product_id = cs.product_id)
)
SELECT sb.company_id, sb.product_id,
    p.name AS product_name, p.purchase_multiple,
    sb.estoque_atual,
    COALESCE(c.total_saida, 0::numeric) AS consumo_7d,
    COALESCE(c.total_saida, 0::numeric) / 7.0 AS consumo_dia,
    CASE WHEN COALESCE(c.total_saida, 0::numeric) = 0 THEN NULL::numeric
         ELSE sb.estoque_atual / (c.total_saida / 7.0) END AS dias_cobertura,
    CASE
        WHEN sb.estoque_atual < 0 THEN '⚠️ anomalia'
        WHEN sb.estoque_atual = 0 AND COALESCE(c.total_saida, 0) > 0 THEN '🔴 ruptura'
        WHEN COALESCE(c.total_saida, 0) = 0 THEN '⚪ sem consumo'
        WHEN (sb.estoque_atual / NULLIF(c.total_saida / 7.0, 0)) <= 2 THEN '🔴 risco'
        WHEN (sb.estoque_atual / NULLIF(c.total_saida / 7.0, 0)) <= 5 THEN '🟡 atenção'
        ELSE '🟢 saudável'
    END AS status_farol,
    CASE
        WHEN COALESCE(c.total_saida, 0) = 0 THEN NULL::numeric
        WHEN sb.estoque_atual <= 0 THEN ceil(7::numeric * (c.total_saida / 7.0))
        WHEN (sb.estoque_atual / NULLIF(c.total_saida / 7.0, 0)) >= 7 THEN 0::numeric
        ELSE ceil((7::numeric - sb.estoque_atual / NULLIF(c.total_saida / 7.0, 0)) * (c.total_saida / 7.0))
    END AS quantidade_bruta,
    CASE
        WHEN COALESCE(c.total_saida, 0) = 0 THEN NULL::numeric
        ELSE ceil(
            CASE
                WHEN sb.estoque_atual <= 0 THEN 7::numeric * (c.total_saida / 7.0)
                WHEN (sb.estoque_atual / NULLIF(c.total_saida / 7.0, 0)) >= 7 THEN 0::numeric
                ELSE (7::numeric - sb.estoque_atual / NULLIF(c.total_saida / 7.0, 0)) * (c.total_saida / 7.0)
            END / GREATEST(p.purchase_multiple, 1)::numeric) * GREATEST(p.purchase_multiple, 1)::numeric
    END AS quantidade_sugerida,
    p.cost_price
FROM stock_base sb
    LEFT JOIN consumption c ON sb.company_id = c.company_id AND sb.product_id = c.product_id
    LEFT JOIN products p ON p.id = sb.product_id;

CREATE VIEW public.farol_lista_compra AS
SELECT company_id, product_id, product_name, status_farol,
    estoque_atual, consumo_dia, dias_cobertura, quantidade_sugerida,
    CASE
        WHEN status_farol = '🔴 ruptura' THEN 1
        WHEN status_farol = '🔴 risco' THEN 2
        WHEN status_farol = '🟡 atenção' THEN 3
        ELSE 99
    END AS prioridade
FROM stock_analysis sa
WHERE quantidade_sugerida > 0
ORDER BY
    CASE
        WHEN status_farol = '🔴 ruptura' THEN 1
        WHEN status_farol = '🔴 risco' THEN 2
        WHEN status_farol = '🟡 atenção' THEN 3
        ELSE 99
    END,
    quantidade_sugerida DESC;

CREATE VIEW public.farol_pedido_fornecedor AS
SELECT s.id AS supplier_id, s.name AS supplier_name,
    sa.product_id, sa.product_name, sa.quantidade_sugerida,
    sa.status_farol, sa.estoque_atual, sa.consumo_dia, sa.dias_cobertura
FROM farol_lista_compra sa
    JOIN products p ON p.id = sa.product_id
    JOIN suppliers s ON s.id = p.supplier_id
ORDER BY s.name, sa.quantidade_sugerida DESC;