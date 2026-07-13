CREATE POLICY "Anon users can read products"
ON public.products FOR SELECT TO anon
USING (true);

CREATE POLICY "Anon users can update products"
ON public.products FOR UPDATE TO anon
USING (true)
WITH CHECK (true);