-- FEATURE 003: dual-write products → product_suppliers
-- Mantém product_suppliers sincronizado com escritas em products
-- (frontend, n8n Vincular, syncs) sem alterar app/views/n8n.
-- Não remove nem altera products.supplier_id.

CREATE OR REPLACE FUNCTION public.sync_product_suppliers_from_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_multiple numeric;
BEGIN
  v_multiple := GREATEST(COALESCE(NEW.purchase_multiple, 1), 1);

  IF TG_OP = 'INSERT' THEN
    IF NEW.supplier_id IS NOT NULL THEN
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
      ) VALUES (
        NEW.company_id,
        NEW.id,
        NEW.supplier_id,
        true,
        true,
        v_multiple,
        NEW.cost_price,
        'dual_write',
        now(),
        now()
      )
      ON CONFLICT (company_id, product_id, supplier_id) DO UPDATE
      SET
        is_primary = true,
        is_active = true,
        purchase_multiple = EXCLUDED.purchase_multiple,
        cost_price = EXCLUDED.cost_price,
        updated_at = now();
    END IF;

    RETURN NEW;
  END IF;

  -- TG_OP = UPDATE
  IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
    -- Remove primary atual (permite trocar fornecedor sem violar índice único parcial)
    UPDATE public.product_suppliers
    SET
      is_primary = false,
      updated_at = now()
    WHERE company_id = NEW.company_id
      AND product_id = NEW.id
      AND is_primary = true;

    IF NEW.supplier_id IS NOT NULL THEN
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
      ) VALUES (
        NEW.company_id,
        NEW.id,
        NEW.supplier_id,
        true,
        true,
        v_multiple,
        NEW.cost_price,
        'dual_write',
        now(),
        now()
      )
      ON CONFLICT (company_id, product_id, supplier_id) DO UPDATE
      SET
        is_primary = true,
        is_active = true,
        purchase_multiple = EXCLUDED.purchase_multiple,
        cost_price = EXCLUDED.cost_price,
        updated_at = now();
    END IF;

  ELSIF NEW.purchase_multiple IS DISTINCT FROM OLD.purchase_multiple
     OR NEW.cost_price IS DISTINCT FROM OLD.cost_price THEN

    IF NEW.supplier_id IS NOT NULL THEN
      -- Garante no máximo 1 primary antes de promover o vínculo espelhado
      UPDATE public.product_suppliers
      SET
        is_primary = false,
        updated_at = now()
      WHERE company_id = NEW.company_id
        AND product_id = NEW.id
        AND is_primary = true
        AND supplier_id IS DISTINCT FROM NEW.supplier_id;

      UPDATE public.product_suppliers
      SET
        purchase_multiple = v_multiple,
        cost_price = NEW.cost_price,
        is_primary = true,
        is_active = true,
        updated_at = now()
      WHERE company_id = NEW.company_id
        AND product_id = NEW.id
        AND supplier_id = NEW.supplier_id;

      IF NOT FOUND THEN
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
        ) VALUES (
          NEW.company_id,
          NEW.id,
          NEW.supplier_id,
          true,
          true,
          v_multiple,
          NEW.cost_price,
          'dual_write',
          now(),
          now()
        )
        ON CONFLICT (company_id, product_id, supplier_id) DO UPDATE
        SET
          is_primary = true,
          is_active = true,
          purchase_multiple = EXCLUDED.purchase_multiple,
          cost_price = EXCLUDED.cost_price,
          updated_at = now();
      END IF;
    ELSE
      UPDATE public.product_suppliers
      SET
        purchase_multiple = v_multiple,
        cost_price = NEW.cost_price,
        updated_at = now()
      WHERE company_id = NEW.company_id
        AND product_id = NEW.id
        AND is_primary = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_suppliers_from_products ON public.products;

CREATE TRIGGER trg_sync_product_suppliers_from_products
AFTER INSERT OR UPDATE OF supplier_id, purchase_multiple, cost_price
ON public.products
FOR EACH ROW
EXECUTE PROCEDURE public.sync_product_suppliers_from_products();

COMMENT ON FUNCTION public.sync_product_suppliers_from_products() IS
  'FEATURE 003: dual-write — espelha products.supplier_id/purchase_multiple/cost_price em product_suppliers';
