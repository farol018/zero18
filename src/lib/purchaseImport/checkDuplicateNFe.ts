import { supabase } from "@/integrations/supabase/client";

export async function findExistingPurchaseByNFeKey(
  companyId: string,
  externalId: string | null,
): Promise<{ id: string } | null> {
  if (!externalId) return null;

  // Qualquer source (xml, bling, …) — evita reimportar a mesma chave
  const { data, error } = await supabase
    .from("purchases")
    .select("id")
    .eq("company_id", companyId)
    .eq("external_id", externalId)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}
