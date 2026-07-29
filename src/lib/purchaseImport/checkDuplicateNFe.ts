import { supabase } from "@/integrations/supabase/client";

export async function findExistingPurchaseByNFeKey(
  companyId: string,
  externalId: string | null,
): Promise<{ id: string } | null> {
  if (!externalId) return null;

  const { data, error } = await supabase
    .from("purchases")
    .select("id")
    .eq("company_id", companyId)
    .eq("source", "xml")
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
