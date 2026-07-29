-- SPRINT 0: Hardening — RLS company-scoped + índices de performance
-- Não altera views Farol, motor de cálculo, triggers nem regras de negócio.
-- Remove policies anon USING (true) e writes anon singleados a UUID fixo.

-- ---------------------------------------------------------------------------
-- 1) Índices de performance
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS inventory_movements_company_created_at_idx
  ON public.inventory_movements (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_movements_company_product_type_created_idx
  ON public.inventory_movements (company_id, product_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS suppliers_company_id_idx
  ON public.suppliers (company_id);

CREATE INDEX IF NOT EXISTS products_company_id_idx
  ON public.products (company_id);

DO $$
BEGIN
  IF to_regclass('public.purchase_items') IS NOT NULL THEN
    EXECUTE $i$
      CREATE INDEX IF NOT EXISTS purchase_items_product_supplier_id_idx
        ON public.purchase_items (product_supplier_id)
        WHERE product_supplier_id IS NOT NULL
    $i$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Helper: company do usuário autenticado
--    (policies usam subquery inline — sem dependência de função)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2b) profiles — usuário lê o próprio perfil (necessário para company_id)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) products — drop anon permissivo; garantir authenticated por company
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon users can read products" ON public.products;
DROP POLICY IF EXISTS "Anon users can update products" ON public.products;
DROP POLICY IF EXISTS "Anon read products" ON public.products;
DROP POLICY IF EXISTS "Anon update products single tenant" ON public.products;

DROP POLICY IF EXISTS "Authenticated read products by company" ON public.products;
CREATE POLICY "Authenticated read products by company"
ON public.products FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated update products by company" ON public.products;
CREATE POLICY "Authenticated update products by company"
ON public.products FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can read products from their company" ON public.products;
DROP POLICY IF EXISTS "Users can update products from their company" ON public.products;

-- ---------------------------------------------------------------------------
-- 4) suppliers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon read suppliers" ON public.suppliers;

DROP POLICY IF EXISTS "Authenticated read suppliers" ON public.suppliers;
CREATE POLICY "Authenticated read suppliers"
ON public.suppliers FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 5) current_stock
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon read current_stock" ON public.current_stock;

DROP POLICY IF EXISTS "Authenticated read current_stock" ON public.current_stock;
CREATE POLICY "Authenticated read current_stock"
ON public.current_stock FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 6) inventory_movements
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon read inventory_movements" ON public.inventory_movements;

DROP POLICY IF EXISTS "Authenticated read inventory_movements" ON public.inventory_movements;
CREATE POLICY "Authenticated read inventory_movements"
ON public.inventory_movements FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 7) companies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon read companies" ON public.companies;

DROP POLICY IF EXISTS "Authenticated read companies" ON public.companies;
CREATE POLICY "Authenticated read companies"
ON public.companies FOR SELECT TO authenticated
USING (id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 8) import_jobs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon read import_jobs" ON public.import_jobs;

DROP POLICY IF EXISTS "Authenticated read import_jobs" ON public.import_jobs;
CREATE POLICY "Authenticated read import_jobs"
ON public.import_jobs FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 9) product_suppliers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon read product_suppliers" ON public.product_suppliers;
DROP POLICY IF EXISTS "Anon insert product_suppliers single tenant" ON public.product_suppliers;
DROP POLICY IF EXISTS "Anon update product_suppliers single tenant" ON public.product_suppliers;
DROP POLICY IF EXISTS "Anon delete product_suppliers single tenant" ON public.product_suppliers;

DROP POLICY IF EXISTS "Authenticated read product_suppliers" ON public.product_suppliers;
CREATE POLICY "Authenticated read product_suppliers"
ON public.product_suppliers FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

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

-- ---------------------------------------------------------------------------
-- 10) brands
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon read brands" ON public.brands;
DROP POLICY IF EXISTS "Anon insert brands single tenant" ON public.brands;
DROP POLICY IF EXISTS "Anon update brands single tenant" ON public.brands;
DROP POLICY IF EXISTS "Anon delete brands single tenant" ON public.brands;

DROP POLICY IF EXISTS "Authenticated read brands" ON public.brands;
CREATE POLICY "Authenticated read brands"
ON public.brands FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated insert brands by company" ON public.brands;
CREATE POLICY "Authenticated insert brands by company"
ON public.brands FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated update brands by company" ON public.brands;
CREATE POLICY "Authenticated update brands by company"
ON public.brands FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated delete brands by company" ON public.brands;
CREATE POLICY "Authenticated delete brands by company"
ON public.brands FOR DELETE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 11) categories
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon read categories" ON public.categories;
DROP POLICY IF EXISTS "Anon insert categories single tenant" ON public.categories;
DROP POLICY IF EXISTS "Anon update categories single tenant" ON public.categories;
DROP POLICY IF EXISTS "Anon delete categories single tenant" ON public.categories;

DROP POLICY IF EXISTS "Authenticated read categories" ON public.categories;
CREATE POLICY "Authenticated read categories"
ON public.categories FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated insert categories by company" ON public.categories;
CREATE POLICY "Authenticated insert categories by company"
ON public.categories FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated update categories by company" ON public.categories;
CREATE POLICY "Authenticated update categories by company"
ON public.categories FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated delete categories by company" ON public.categories;
CREATE POLICY "Authenticated delete categories by company"
ON public.categories FOR DELETE TO authenticated
USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 12) purchases (só se a tabela existir)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.purchases') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anon read purchases" ON public.purchases';
    EXECUTE 'DROP POLICY IF EXISTS "Anon insert purchases single tenant" ON public.purchases';
    EXECUTE 'DROP POLICY IF EXISTS "Anon update purchases single tenant" ON public.purchases';
    EXECUTE 'DROP POLICY IF EXISTS "Anon delete purchases single tenant" ON public.purchases';

    EXECUTE $p$
      DROP POLICY IF EXISTS "Authenticated read purchases" ON public.purchases;
      CREATE POLICY "Authenticated read purchases"
      ON public.purchases FOR SELECT TO authenticated
      USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    $p$;

    EXECUTE $p$
      DROP POLICY IF EXISTS "Authenticated insert purchases by company" ON public.purchases;
      CREATE POLICY "Authenticated insert purchases by company"
      ON public.purchases FOR INSERT TO authenticated
      WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    $p$;

    EXECUTE $p$
      DROP POLICY IF EXISTS "Authenticated update purchases by company" ON public.purchases;
      CREATE POLICY "Authenticated update purchases by company"
      ON public.purchases FOR UPDATE TO authenticated
      USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
      WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    $p$;

    EXECUTE $p$
      DROP POLICY IF EXISTS "Authenticated delete purchases by company" ON public.purchases;
      CREATE POLICY "Authenticated delete purchases by company"
      ON public.purchases FOR DELETE TO authenticated
      USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    $p$;
  END IF;

  IF to_regclass('public.purchase_items') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anon read purchase_items" ON public.purchase_items';
    EXECUTE 'DROP POLICY IF EXISTS "Anon insert purchase_items single tenant" ON public.purchase_items';
    EXECUTE 'DROP POLICY IF EXISTS "Anon update purchase_items single tenant" ON public.purchase_items';
    EXECUTE 'DROP POLICY IF EXISTS "Anon delete purchase_items single tenant" ON public.purchase_items';

    EXECUTE $p$
      DROP POLICY IF EXISTS "Authenticated read purchase_items" ON public.purchase_items;
      CREATE POLICY "Authenticated read purchase_items"
      ON public.purchase_items FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.purchases p
          WHERE p.id = purchase_id
            AND p.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
      )
    $p$;

    EXECUTE $p$
      DROP POLICY IF EXISTS "Authenticated insert purchase_items by company" ON public.purchase_items;
      CREATE POLICY "Authenticated insert purchase_items by company"
      ON public.purchase_items FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.purchases p
          WHERE p.id = purchase_id
            AND p.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
      )
    $p$;

    EXECUTE $p$
      DROP POLICY IF EXISTS "Authenticated update purchase_items by company" ON public.purchase_items;
      CREATE POLICY "Authenticated update purchase_items by company"
      ON public.purchase_items FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.purchases p
          WHERE p.id = purchase_id
            AND p.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.purchases p
          WHERE p.id = purchase_id
            AND p.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
      )
    $p$;

    EXECUTE $p$
      DROP POLICY IF EXISTS "Authenticated delete purchase_items by company" ON public.purchase_items;
      CREATE POLICY "Authenticated delete purchase_items by company"
      ON public.purchase_items FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.purchases p
          WHERE p.id = purchase_id
            AND p.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
      )
    $p$;
  END IF;
END $$;
