-- FEATURE 015: último custo na confirmação de compra (+ backfill)
-- Spec: docs/superpowers/specs/2026-08-06-feature-015-last-cost-from-purchases-design.md
--
-- draft → confirmed: atualiza products.cost_price e product_suppliers.cost_price
--   (supplier da compra), usando purchase_items com maior id por product_id.
-- confirmed → cancelled: NÃO altera custo (estoque fica a cargo do trigger 012).

CREATE OR REPLACE FUNCTION public.fz_apply_last_purchase_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status = 'draft'
     AND NEW.status = 'confirmed' THEN

    FOR r IN
      SELECT DISTINCT ON (pi.product_id)
        pi.product_id,
        pi.unit_cost
      FROM public.purchase_items pi
      WHERE pi.purchase_id = NEW.id
      ORDER BY pi.product_id, pi.id DESC
    LOOP
      UPDATE public.products p
      SET cost_price = r.unit_cost
      WHERE p.id = r.product_id
        AND p.company_id = NEW.company_id;

      UPDATE public.product_suppliers ps
      SET cost_price = r.unit_cost,
          updated_at = now()
      WHERE ps.company_id = NEW.company_id
        AND ps.product_id = r.product_id
        AND ps.supplier_id = NEW.supplier_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_last_cost ON public.purchases;

CREATE TRIGGER trg_purchase_last_cost
AFTER UPDATE OF status ON public.purchases
FOR EACH ROW
EXECUTE FUNCTION public.fz_apply_last_purchase_cost();

COMMENT ON FUNCTION public.fz_apply_last_purchase_cost() IS
  'FEATURE 015: on draft→confirmed set products/product_suppliers cost_price from last purchase line unit_cost.';

-- ---------------------------------------------------------------------------
-- Backfill one-shot (idempotente)
-- ---------------------------------------------------------------------------

WITH last_line AS (
  SELECT DISTINCT ON (p.company_id, pi.product_id)
    p.company_id,
    p.supplier_id,
    pi.product_id,
    pi.unit_cost
  FROM public.purchases p
  JOIN public.purchase_items pi ON pi.purchase_id = p.id
  WHERE p.status = 'confirmed'
  ORDER BY
    p.company_id,
    pi.product_id,
    p.issued_at DESC NULLS LAST,
    p.updated_at DESC NULLS LAST,
    p.id DESC,
    pi.id DESC
)
UPDATE public.products prod
SET cost_price = ll.unit_cost
FROM last_line ll
WHERE prod.id = ll.product_id
  AND prod.company_id = ll.company_id;

WITH last_line AS (
  SELECT DISTINCT ON (p.company_id, pi.product_id)
    p.company_id,
    p.supplier_id,
    pi.product_id,
    pi.unit_cost
  FROM public.purchases p
  JOIN public.purchase_items pi ON pi.purchase_id = p.id
  WHERE p.status = 'confirmed'
  ORDER BY
    p.company_id,
    pi.product_id,
    p.issued_at DESC NULLS LAST,
    p.updated_at DESC NULLS LAST,
    p.id DESC,
    pi.id DESC
)
UPDATE public.product_suppliers ps
SET cost_price = ll.unit_cost,
    updated_at = now()
FROM last_line ll
WHERE ps.company_id = ll.company_id
  AND ps.product_id = ll.product_id
  AND ps.supplier_id = ll.supplier_id;
