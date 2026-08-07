-- HOTFIX: não criar rascunho BLING quando nenhum item casa com o catálogo
-- (evita compras vazias tipo NF sem produtos matchados)

CREATE OR REPLACE FUNCTION public.import_purchase_nfe(
  p_company_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_chave text := public.fz_normalize_digits(p_payload->>'external_id');
  v_supplier_id uuid;
  v_supplier_doc text;
  v_supplier_name text;
  v_supplier_created boolean := false;
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
  v_before uuid;
BEGIN
  IF p_company_id IS NULL OR v_chave IS NULL OR length(v_chave) <> 44 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'company_id ou chave NFe inválidos');
  END IF;

  IF public.fz_is_purchase_return(p_payload) THEN
    RETURN jsonb_build_object('status', 'rejected_return');
  END IF;

  v_supplier_doc := coalesce(
    nullif(public.fz_normalize_digits(p_payload#>>'{supplier,document}'), ''),
    CASE WHEN length(v_chave) = 44 THEN substring(v_chave from 7 for 14) ELSE NULL END
  );
  v_supplier_name := nullif(trim(coalesce(p_payload#>>'{supplier,name}', '')), '');

  IF public.fz_is_marketplace_supplier(v_supplier_doc) THEN
    RETURN jsonb_build_object(
      'status', 'rejected_marketplace',
      'supplier_document', v_supplier_doc,
      'supplier_name', v_supplier_name
    );
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

  v_before := public.fz_match_supplier(p_company_id, v_supplier_doc);
  IF v_before IS NULL THEN
    v_supplier_id := public.fz_ensure_supplier(p_company_id, v_supplier_doc, v_supplier_name);
    v_supplier_created := (v_supplier_id IS NOT NULL);
  ELSE
    v_supplier_id := v_before;
    PERFORM public.fz_ensure_supplier(p_company_id, v_supplier_doc, v_supplier_name);
  END IF;

  IF v_supplier_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', CASE
        WHEN v_supplier_doc IS NULL THEN 'CNPJ do fornecedor ausente na NFe'
        ELSE 'Fornecedor ambíguo para o CNPJ (mais de um cadastro com o mesmo document)'
      END,
      'supplier_document', v_supplier_doc,
      'supplier_name', v_supplier_name,
      'matched_items', 0,
      'unbound_items', 0
    );
  END IF;

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

  -- HOTFIX: zero match → não cria rascunho vazio
  IF v_matched = 0 THEN
    RETURN jsonb_build_object(
      'status', 'rejected_no_match',
      'message', 'Nenhum item da NFe casou com produto do catálogo',
      'matched_items', 0,
      'unbound_items', v_unbound,
      'supplier_id', v_supplier_id,
      'supplier_document', v_supplier_doc,
      'supplier_name', v_supplier_name,
      'supplier_created', v_supplier_created
    );
  END IF;

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
    'unbound_items', v_unbound,
    'supplier_id', v_supplier_id,
    'supplier_created', v_supplier_created
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status', 'skipped_duplicate');
END;
$fn$;

COMMENT ON FUNCTION public.import_purchase_nfe(uuid, jsonb) IS
  'FEATURE 012: importa NFe BLING; rejeita return/marketplace; HOTFIX rejected_no_match se zero itens casados';

REVOKE ALL ON FUNCTION public.import_purchase_nfe(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_purchase_nfe(uuid, jsonb) TO service_role;
