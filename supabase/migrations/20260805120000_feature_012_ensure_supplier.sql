-- FEATURE 012: auto-criar/atualizar fornecedor pelo CNPJ da NFe de entrada
-- (desbloqueia sync quando suppliers.document está vazio / fornecedor ainda não cadastrado)

CREATE OR REPLACE FUNCTION public.fz_ensure_supplier(
  p_company_id uuid,
  p_document text,
  p_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  doc text := public.fz_normalize_digits(p_document);
  sid uuid;
  cnt int;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
BEGIN
  IF p_company_id IS NULL OR doc IS NULL OR length(doc) < 11 THEN
    RETURN NULL;
  END IF;

  -- Match único por document (mesma regra de fz_match_supplier)
  SELECT count(*) INTO cnt
  FROM public.suppliers s
  WHERE s.company_id = p_company_id
    AND public.fz_normalize_digits(s.document) = doc;

  IF cnt = 1 THEN
    SELECT s.id INTO sid
    FROM public.suppliers s
    WHERE s.company_id = p_company_id
      AND public.fz_normalize_digits(s.document) = doc
    LIMIT 1;

    -- Preenche nome se o cadastro estava genérico/vazio e a NFe trouxe nome
    IF v_name IS NOT NULL THEN
      UPDATE public.suppliers
      SET name = v_name
      WHERE id = sid
        AND (
          name IS NULL
          OR trim(name) = ''
          OR name ~* '^fornecedor\s+\d'
        );
    END IF;

    RETURN sid;
  END IF;

  IF cnt > 1 THEN
    -- Ambíguo: não cria outro; deixa o import falhar com mensagem clara
    RETURN NULL;
  END IF;

  -- Fornecedor já existe sem document, mas com o mesmo nome → só preenche CNPJ
  IF v_name IS NOT NULL THEN
    SELECT count(*) INTO cnt
    FROM public.suppliers s
    WHERE s.company_id = p_company_id
      AND public.fz_normalize_digits(s.document) IS NULL
      AND lower(trim(regexp_replace(s.name, '\s+', ' ', 'g')))
        = lower(trim(regexp_replace(v_name, '\s+', ' ', 'g')));

    IF cnt = 1 THEN
      SELECT s.id INTO sid
      FROM public.suppliers s
      WHERE s.company_id = p_company_id
        AND public.fz_normalize_digits(s.document) IS NULL
        AND lower(trim(regexp_replace(s.name, '\s+', ' ', 'g')))
          = lower(trim(regexp_replace(v_name, '\s+', ' ', 'g')))
      LIMIT 1;

      UPDATE public.suppliers
      SET document = doc
      WHERE id = sid
        AND document IS NULL;

      RETURN sid;
    END IF;
  END IF;

  INSERT INTO public.suppliers (company_id, name, document, external_id)
  VALUES (
    p_company_id,
    coalesce(v_name, 'Fornecedor ' || doc),
    doc,
    'nfe-doc:' || doc
  )
  RETURNING id INTO sid;

  RETURN sid;
EXCEPTION
  WHEN unique_violation THEN
    -- Concorrência / unique em external_id: re-lê por document ou external_id
    SELECT s.id INTO sid
    FROM public.suppliers s
    WHERE s.company_id = p_company_id
      AND (
        public.fz_normalize_digits(s.document) = doc
        OR s.external_id = 'nfe-doc:' || doc
      )
    ORDER BY CASE WHEN public.fz_normalize_digits(s.document) = doc THEN 0 ELSE 1 END
    LIMIT 1;
    RETURN sid;
END;
$$;

COMMENT ON FUNCTION public.fz_ensure_supplier(uuid, text, text) IS
  'FEATURE 012: resolve supplier by CNPJ; cria se não existir (external_id=nfe-doc:{cnpj}).';

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

  v_supplier_doc := coalesce(
    nullif(public.fz_normalize_digits(p_payload#>>'{supplier,document}'), ''),
    CASE WHEN length(v_chave) = 44 THEN substring(v_chave from 7 for 14) ELSE NULL END
  );
  v_supplier_name := nullif(trim(coalesce(p_payload#>>'{supplier,name}', '')), '');

  v_before := public.fz_match_supplier(p_company_id, v_supplier_doc);
  IF v_before IS NULL THEN
    v_supplier_id := public.fz_ensure_supplier(p_company_id, v_supplier_doc, v_supplier_name);
    v_supplier_created := (v_supplier_id IS NOT NULL);
  ELSE
    v_supplier_id := v_before;
    -- Atualiza nome genérico se necessário
    PERFORM public.fz_ensure_supplier(p_company_id, v_supplier_doc, v_supplier_name);
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

  IF v_supplier_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', CASE
        WHEN v_supplier_doc IS NULL THEN 'CNPJ do fornecedor ausente na NFe'
        ELSE 'Fornecedor ambíguo para o CNPJ (mais de um cadastro com o mesmo document)'
      END,
      'supplier_document', v_supplier_doc,
      'supplier_name', v_supplier_name,
      'matched_items', v_matched,
      'unbound_items', v_unbound
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
$$;

REVOKE ALL ON FUNCTION public.import_purchase_nfe(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_purchase_nfe(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fz_ensure_supplier(uuid, text, text) TO service_role;
