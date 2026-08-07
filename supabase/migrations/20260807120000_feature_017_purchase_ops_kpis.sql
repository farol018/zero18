-- FEATURE 017: purchase ops KPIs for Gestão tab

CREATE OR REPLACE FUNCTION public.get_purchase_ops_kpis(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_company uuid;
  v_today date := CURRENT_DATE;
  v_d14_start date := v_today - 13;
  v_d30_start date := v_today - 29;
  v_d14 jsonb;
  v_d30 jsonb;
  v_drafts jsonb;
  v_top jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required';
  END IF;

  SELECT company_id INTO v_profile_company
  FROM public.profiles
  WHERE id = v_uid;

  IF v_profile_company IS NULL OR v_profile_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH w AS (
    SELECT
      status,
      coalesce(total_amount, 0)::numeric AS amount
    FROM public.purchases
    WHERE company_id = p_company_id
      AND issued_at BETWEEN v_d14_start AND v_today
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_count,
      coalesce(sum(amount) FILTER (WHERE status = 'confirmed'), 0)::numeric AS confirmed_amount,
      count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
      count(*) FILTER (WHERE status = 'confirmed')::int AS c,
      count(*) FILTER (WHERE status = 'draft')::int AS d
    FROM w
  )
  SELECT jsonb_build_object(
    'confirmed_count', confirmed_count,
    'confirmed_amount', confirmed_amount,
    'cancelled_count', cancelled_count,
    'confirmed_vs_draft_pct',
      CASE WHEN (c + d) = 0 THEN NULL
           ELSE round((c::numeric / (c + d)::numeric) * 100, 2)
      END
  )
  INTO v_d14
  FROM agg;

  WITH w AS (
    SELECT
      status,
      coalesce(total_amount, 0)::numeric AS amount
    FROM public.purchases
    WHERE company_id = p_company_id
      AND issued_at BETWEEN v_d30_start AND v_today
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_count,
      coalesce(sum(amount) FILTER (WHERE status = 'confirmed'), 0)::numeric AS confirmed_amount,
      count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
      count(*) FILTER (WHERE status = 'confirmed')::int AS c,
      count(*) FILTER (WHERE status = 'draft')::int AS d
    FROM w
  )
  SELECT jsonb_build_object(
    'confirmed_count', confirmed_count,
    'confirmed_amount', confirmed_amount,
    'cancelled_count', cancelled_count,
    'confirmed_vs_draft_pct',
      CASE WHEN (c + d) = 0 THEN NULL
           ELSE round((c::numeric / (c + d)::numeric) * 100, 2)
      END
  )
  INTO v_d30
  FROM agg;

  SELECT jsonb_build_object(
    'total', count(*)::int,
    'total_amount', coalesce(sum(coalesce(total_amount, 0)), 0)::numeric,
    'bling', count(*) FILTER (WHERE source = 'bling')::int,
    'farol', count(*) FILTER (WHERE source = 'farol')::int,
    'other', count(*) FILTER (WHERE source IS DISTINCT FROM 'bling' AND source IS DISTINCT FROM 'farol')::int
  )
  INTO v_drafts
  FROM public.purchases
  WHERE company_id = p_company_id
    AND status = 'draft';

  SELECT coalesce(jsonb_agg(row_json ORDER BY amount DESC), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT jsonb_build_object(
      'supplier_id', p.supplier_id,
      'name', coalesce(s.name, 'Sem fornecedor'),
      'amount', sum(coalesce(p.total_amount, 0)),
      'count', count(*)::int
    ) AS row_json,
    sum(coalesce(p.total_amount, 0)) AS amount
    FROM public.purchases p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    WHERE p.company_id = p_company_id
      AND p.status = 'confirmed'
      AND p.issued_at BETWEEN v_d30_start AND v_today
    GROUP BY p.supplier_id, s.name
    ORDER BY sum(coalesce(p.total_amount, 0)) DESC
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'windows', jsonb_build_object('d14', v_d14, 'd30', v_d30),
    'drafts_open', v_drafts,
    'top_suppliers_d30', v_top
  );
END;
$$;

COMMENT ON FUNCTION public.get_purchase_ops_kpis(uuid) IS
  'FEATURE 017: KPIs de compras (14/30d, drafts, top 5) para aba Gestão';

REVOKE ALL ON FUNCTION public.get_purchase_ops_kpis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_purchase_ops_kpis(uuid) TO authenticated;
