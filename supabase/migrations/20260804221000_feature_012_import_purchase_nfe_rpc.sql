-- FEATURE 012 Task 2: helper functions for import_purchase_nfe (RPC in Task 3)

CREATE OR REPLACE FUNCTION public.fz_normalize_digits(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.fz_normalize_code(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(upper(trim(coalesce(p, ''))), '');
$$;

CREATE OR REPLACE FUNCTION public.fz_is_purchase_return(p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  nat text := lower(coalesce(p_payload->>'natureza', p_payload->>'naturezaOperacao', ''));
  cfops text := lower(coalesce(p_payload->>'cfops', p_payload#>>'{cfops}', ''));
BEGIN
  IF nat ~ 'devolu' OR nat ~ 'retorno' THEN
    RETURN true;
  END IF;
  -- CFOPs comuns de devolução de compra (ajustar com amostras reais do tenant)
  IF cfops ~ '\m(1201|1202|2201|2202|1410|2410)\M' THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.fz_match_supplier(p_company_id uuid, p_document text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  doc text := public.fz_normalize_digits(p_document);
  sid uuid;
BEGIN
  IF doc IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT s.id INTO sid
  FROM public.suppliers s
  WHERE s.company_id = p_company_id
    AND public.fz_normalize_digits(s.document) = doc
  LIMIT 2;
  IF FOUND THEN
    -- ambíguo se houver >1: só aceita se exatamente 1
    IF (SELECT count(*) FROM public.suppliers s
        WHERE s.company_id = p_company_id
          AND public.fz_normalize_digits(s.document) = doc) = 1 THEN
      RETURN sid;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fz_match_product(
  p_company_id uuid,
  p_supplier_id uuid,
  p_item jsonb
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_gtin text := public.fz_normalize_code(p_item->>'gtin');
  v_cprod text := public.fz_normalize_code(p_item->>'supplier_product_code');
  v_sku text := public.fz_normalize_code(p_item->>'sku');
  v_ext text := public.fz_normalize_code(p_item->>'code_internal');
  v_name text := lower(trim(regexp_replace(coalesce(p_item->>'name', ''), '\s+', ' ', 'g')));
  pid uuid;
  cnt int;
BEGIN
  -- Paridade FEATURE 011 matchPurchaseImport: external_id → gtin → supplier_product_code → sku → name
  IF v_ext IS NOT NULL THEN
    SELECT p.id INTO pid
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.external_id) = v_ext
    LIMIT 1;
    SELECT count(*) INTO cnt
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.external_id) = v_ext;
    IF cnt = 1 THEN RETURN pid; END IF;
  END IF;

  IF v_gtin IS NOT NULL AND v_gtin !~* '^SEM\s*GTIN$' THEN
    SELECT p.id INTO pid
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.gtin) = v_gtin
      AND public.fz_normalize_code(p.gtin) !~* '^SEM\s*GTIN$'
    LIMIT 1;
    SELECT count(*) INTO cnt
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.gtin) = v_gtin
      AND public.fz_normalize_code(p.gtin) !~* '^SEM\s*GTIN$';
    IF cnt = 1 THEN RETURN pid; END IF;
  END IF;

  IF p_supplier_id IS NOT NULL AND v_cprod IS NOT NULL THEN
    SELECT ps.product_id INTO pid
    FROM public.product_suppliers ps
    WHERE ps.company_id = p_company_id
      AND ps.supplier_id = p_supplier_id
      AND public.fz_normalize_code(ps.supplier_sku) = v_cprod
    LIMIT 1;
    SELECT count(*) INTO cnt
    FROM public.product_suppliers ps
    WHERE ps.company_id = p_company_id
      AND ps.supplier_id = p_supplier_id
      AND public.fz_normalize_code(ps.supplier_sku) = v_cprod;
    IF cnt = 1 THEN RETURN pid; END IF;
  END IF;

  IF v_sku IS NOT NULL OR v_cprod IS NOT NULL THEN
    SELECT p.id INTO pid
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.sku) IN (v_sku, v_cprod)
    LIMIT 1;
    SELECT count(*) INTO cnt
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND public.fz_normalize_code(p.sku) IN (v_sku, v_cprod);
    IF cnt = 1 THEN RETURN pid; END IF;
  END IF;

  IF v_name IS NOT NULL AND v_name <> '' THEN
    SELECT p.id INTO pid
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND lower(trim(regexp_replace(p.name, '\s+', ' ', 'g'))) = v_name
    LIMIT 1;
    SELECT count(*) INTO cnt
    FROM public.products p
    WHERE p.company_id = p_company_id
      AND lower(trim(regexp_replace(p.name, '\s+', ' ', 'g'))) = v_name;
    IF cnt = 1 THEN RETURN pid; END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_purchase_nfe(
  p_company_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chave text := public.fz_normalize_digits(p_payload->>'external_id');
  v_supplier_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_purchase_id uuid;
  v_matched int := 0;
  v_unbound int := 0;
  v_status text;
  v_total numeric := 0;
  v_existing uuid;
  v_items jsonb;
  v_i int;
BEGIN
  IF p_company_id IS NULL OR v_chave IS NULL OR length(v_chave) <> 44 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'company_id ou chave NFe inválidos');
  END IF;

  IF public.fz_is_purchase_return(p_payload) THEN
    RETURN jsonb_build_object('status', 'rejected_return');
  END IF;

  SELECT id INTO v_existing
  FROM public.purchases
  WHERE company_id = p_company_id
    AND source = 'bling'
    AND external_id = v_chave;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'skipped_duplicate');
  END IF;

  v_items := coalesce(p_payload->'items', '[]'::jsonb);
  IF jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'NFe sem itens');
  END IF;

  -- CNPJ do emitente: payload.supplier.document, senão posições 7-20 da chave NFe
  v_supplier_id := public.fz_match_supplier(
    p_company_id,
    coalesce(
      nullif(public.fz_normalize_digits(p_payload#>>'{supplier,document}'), ''),
      CASE WHEN length(v_chave) = 44 THEN substring(v_chave from 7 for 14) ELSE NULL END
    )
  );

  -- Pre-scan para calcular totais e decidir se a compra pode ser confirmada.
  FOR v_i IN 0 .. jsonb_array_length(v_items) - 1 LOOP
    v_item := v_items->v_i;
    v_product_id := public.fz_match_product(p_company_id, v_supplier_id, v_item);

    IF v_product_id IS NULL THEN
      v_unbound := v_unbound + 1;
    ELSE
      v_matched := v_matched + 1;
    END IF;

    v_total := v_total + round(
      coalesce(v_item->>'quantity', '0')::numeric
      * coalesce(v_item->>'unit_cost', '0')::numeric,
      2
    );
  END LOOP;

  IF v_supplier_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Fornecedor não localizado pelo CNPJ; cadastre document no fornecedor',
      'supplier_document', coalesce(
        nullif(public.fz_normalize_digits(p_payload#>>'{supplier,document}'), ''),
        CASE WHEN length(v_chave) = 44 THEN substring(v_chave from 7 for 14) ELSE NULL END
      ),
      'supplier_name', p_payload#>>'{supplier,name}',
      'matched_items', v_matched,
      'unbound_items', v_unbound
    );
  END IF;

  -- A compra nasce sempre draft: itens precisam existir antes de uma confirmação
  -- poder disparar a movimentação de estoque.
  INSERT INTO public.purchases (
    company_id, supplier_id, issued_at, invoice_number, invoice_series,
    total_amount, status, source, external_id
  ) VALUES (
    p_company_id,
    v_supplier_id,
    coalesce((p_payload->>'issued_at')::date, current_date),
    nullif(p_payload->>'invoice_number', ''),
    nullif(p_payload->>'invoice_series', ''),
    v_total,
    'draft',
    'bling',
    v_chave
  )
  RETURNING id INTO v_purchase_id;

  FOR v_i IN 0 .. jsonb_array_length(v_items) - 1 LOOP
    v_item := v_items->v_i;
    v_product_id := public.fz_match_product(p_company_id, v_supplier_id, v_item);

    -- No MVP, linhas não vinculadas permanecem para revisão no draft.
    IF v_product_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.purchase_items (
      company_id, purchase_id, product_id, quantity, unit_cost
    ) VALUES (
      p_company_id,
      v_purchase_id,
      v_product_id,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_cost')::numeric
    );
  END LOOP;

  IF v_unbound = 0 THEN
    UPDATE public.purchases
    SET status = 'confirmed'
    WHERE id = v_purchase_id;

    v_status := 'confirmed';
  ELSE
    v_status := 'draft';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'purchase_id', v_purchase_id,
    'matched_items', v_matched,
    'unbound_items', v_unbound
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status', 'skipped_duplicate');
END;
$$;

REVOKE ALL ON FUNCTION public.import_purchase_nfe(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_purchase_nfe(uuid, jsonb) TO service_role;
