-- FEATURE 006: RLS de escrita em product_suppliers (UI de manutenção)
-- Não altera views, triggers nem regras de cálculo.

DROP POLICY IF EXISTS "Anon insert product_suppliers single tenant" ON public.product_suppliers;
CREATE POLICY "Anon insert product_suppliers single tenant"
ON public.product_suppliers FOR INSERT TO anon
WITH CHECK (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid);

DROP POLICY IF EXISTS "Anon update product_suppliers single tenant" ON public.product_suppliers;
CREATE POLICY "Anon update product_suppliers single tenant"
ON public.product_suppliers FOR UPDATE TO anon
USING (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid)
WITH CHECK (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid);

DROP POLICY IF EXISTS "Anon delete product_suppliers single tenant" ON public.product_suppliers;
CREATE POLICY "Anon delete product_suppliers single tenant"
ON public.product_suppliers FOR DELETE TO anon
USING (company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid);

DROP POLICY IF EXISTS "Authenticated insert product_suppliers by company" ON public.product_suppliers;
CREATE POLICY "Authenticated insert product_suppliers by company"
ON public.product_suppliers FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated update product_suppliers by company" ON public.product_suppliers;
CREATE POLICY "Authenticated update product_suppliers by company"
ON public.product_suppliers FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated delete product_suppliers by company" ON public.product_suppliers;
CREATE POLICY "Authenticated delete product_suppliers by company"
ON public.product_suppliers FOR DELETE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
