-- Fix: trigger de compra → inventory_movements falhava com RLS
-- (authenticated só tinha SELECT em inventory_movements; n8n usa service_role).
-- Escopo: permitir INSERT/UPDATE/DELETE na própria company via profile.

DROP POLICY IF EXISTS "Authenticated insert inventory_movements by company"
  ON public.inventory_movements;
CREATE POLICY "Authenticated insert inventory_movements by company"
ON public.inventory_movements
FOR INSERT TO authenticated
WITH CHECK (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Authenticated update inventory_movements by company"
  ON public.inventory_movements;
CREATE POLICY "Authenticated update inventory_movements by company"
ON public.inventory_movements
FOR UPDATE TO authenticated
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Authenticated delete inventory_movements by company"
  ON public.inventory_movements;
CREATE POLICY "Authenticated delete inventory_movements by company"
ON public.inventory_movements
FOR DELETE TO authenticated
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);
