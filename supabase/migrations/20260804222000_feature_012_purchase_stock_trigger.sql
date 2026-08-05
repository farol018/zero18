-- FEATURE 012 Task 4: purchase confirm/cancel → inventory_movements (entrada)
--
-- BEFORE APPLYING: list legacy purchase→inventory triggers on the target DB and
-- drop any that write inventory_movements on draft insert (avoid double stock).
-- We cannot query live from migrations; run this manually on the environment:
--
--   SELECT c.relname, t.tgname, p.proname
--   FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND NOT t.tgisinternal
--     AND c.relname IN ('purchases', 'purchase_items');
--
-- Then DROP TRIGGER ... ON public.purchases / purchase_items for any legacy
-- stock-sync triggers before applying this migration.
--
-- RPC path (import_purchase_nfe): always draft → insert items → UPDATE confirmed.
-- No INSERT branch here: items must exist before stock movements are created.

CREATE OR REPLACE FUNCTION public.fz_sync_purchase_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status = 'draft' AND NEW.status = 'confirmed' THEN
      INSERT INTO public.inventory_movements (
        company_id, product_id, quantity, type, reference_type, reference_id, created_at
      )
      SELECT
        NEW.company_id,
        pi.product_id,
        pi.quantity,
        'entrada',
        'purchase',
        NEW.id::text || ':' || pi.id::text,
        now()
      FROM public.purchase_items pi
      WHERE pi.purchase_id = NEW.id
      ON CONFLICT (company_id, product_id, reference_type, reference_id)
      DO UPDATE SET quantity = EXCLUDED.quantity;
    ELSIF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
      DELETE FROM public.inventory_movements
      WHERE company_id = NEW.company_id
        AND reference_type = 'purchase'
        AND reference_id LIKE NEW.id::text || ':%';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_stock_sync ON public.purchases;

CREATE TRIGGER trg_purchase_stock_sync
AFTER UPDATE OF status ON public.purchases
FOR EACH ROW
EXECUTE FUNCTION public.fz_sync_purchase_stock();

COMMENT ON FUNCTION public.fz_sync_purchase_stock() IS
  'FEATURE 012: on draft→confirmed insert entrada movements; on confirmed→cancelled delete them.';
