-- FAROL: janela de consumo alinhada ao sync de NF (14 dias)
UPDATE public.companies
SET consumption_window_days = 14
WHERE id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'::uuid
  AND consumption_window_days IS DISTINCT FROM 14;
