-- Um pedido BLING tem vários itens → não pode haver UNIQUE em (company_id, external_reference)

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS unique_external_reference_company;
