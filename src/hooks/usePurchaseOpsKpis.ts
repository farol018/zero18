import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { parsePurchaseOpsKpis, type PurchaseOpsKpis } from "@/lib/purchaseOpsKpis";

export function usePurchaseOpsKpis() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["purchase-ops-kpis", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<PurchaseOpsKpis> => {
      const { data, error } = await supabase.rpc("get_purchase_ops_kpis", {
        p_company_id: companyId,
      });
      if (error) throw error;
      return parsePurchaseOpsKpis(data);
    },
  });
}
