import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export type ProductSupplierLink = {
  id: string;
  company_id: string;
  product_id: string;
  supplier_id: string;
  is_primary: boolean;
  is_active: boolean;
  supplier_sku: string | null;
  lead_time_days: number | null;
  purchase_multiple: number;
  cost_price: number | null;
  source: string;
  supplier_name: string;
};

export type ProductSupplierUpdate = {
  lead_time_days?: number | null;
  purchase_multiple?: number;
  cost_price?: number | null;
  supplier_sku?: string | null;
  is_active?: boolean;
};

const linksKey = (productId: string) => ["product_suppliers", productId] as const;

export function useProductSuppliers(productId: string | null) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  const linksQuery = useQuery({
    queryKey: linksKey(productId ?? ""),
    enabled: Boolean(productId && companyId),
    queryFn: async (): Promise<ProductSupplierLink[]> => {
      if (!companyId || !productId) throw new Error("Empresa ou produto inválido.");
      const { data, error } = await supabase
        .from("product_suppliers")
        .select(
          "id, company_id, product_id, supplier_id, is_primary, is_active, supplier_sku, lead_time_days, purchase_multiple, cost_price, source",
        )
        .eq("product_id", productId)
        .eq("company_id", companyId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) throw error;

      const rows = data ?? [];
      const supplierIds = [...new Set(rows.map((r) => r.supplier_id))];
      const nameMap = new Map<string, string>();

      if (supplierIds.length > 0) {
        const { data: suppliers, error: sErr } = await supabase
          .from("suppliers")
          .select("id, name")
          .in("id", supplierIds);
        if (sErr) throw sErr;
        for (const s of suppliers ?? []) nameMap.set(s.id, s.name);
      }

      return rows.map((r) => ({
        ...r,
        purchase_multiple: Number(r.purchase_multiple ?? 1),
        cost_price: r.cost_price != null ? Number(r.cost_price) : null,
        lead_time_days: r.lead_time_days != null ? Number(r.lead_time_days) : null,
        supplier_name: nameMap.get(r.supplier_id) ?? "Fornecedor",
      }));
    },
  });

  const invalidate = async () => {
    if (productId) {
      await queryClient.invalidateQueries({ queryKey: linksKey(productId) });
    }
    await queryClient.invalidateQueries({ queryKey: ["farol"], refetchType: "all" });
  };

  const addLink = useMutation({
    mutationFn: async (supplierId: string) => {
      if (!productId || !companyId) throw new Error("Produto ou empresa inválido");

      const existing = linksQuery.data ?? [];
      if (existing.some((l) => l.supplier_id === supplierId)) {
        throw new Error("Este fornecedor já está vinculado ao produto.");
      }

      const makePrimary = existing.length === 0;

      const { error } = await supabase.from("product_suppliers").insert({
        company_id: companyId,
        product_id: productId,
        supplier_id: supplierId,
        is_primary: makePrimary,
        is_active: true,
        purchase_multiple: 1,
        source: "manual",
      });

      if (error) {
        if (error.code === "23505") {
          throw new Error("Este fornecedor já está vinculado ao produto.");
        }
        throw error;
      }

      if (makePrimary) {
        const { error: pErr } = await supabase
          .from("products")
          .update({ supplier_id: supplierId })
          .eq("id", productId);
        if (pErr) throw pErr;
      }
    },
    onSuccess: invalidate,
  });

  const setPrimary = useMutation({
    mutationFn: async (link: ProductSupplierLink) => {
      if (!productId) throw new Error("Produto inválido");
      if (link.is_primary) return;

      // Espelha no products.supplier_id; o trigger FEATURE 003 ajusta is_primary
      const { error } = await supabase
        .from("products")
        .update({ supplier_id: link.supplier_id })
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateLink = useMutation({
    mutationFn: async ({
      link,
      patch,
    }: {
      link: ProductSupplierLink;
      patch: ProductSupplierUpdate;
    }) => {
      const purchaseMultiple =
        patch.purchase_multiple !== undefined
          ? Math.max(1, patch.purchase_multiple)
          : undefined;

      const { error } = await supabase
        .from("product_suppliers")
        .update({
          updated_at: new Date().toISOString(),
          ...(patch.lead_time_days !== undefined
            ? { lead_time_days: patch.lead_time_days }
            : {}),
          ...(purchaseMultiple !== undefined
            ? { purchase_multiple: purchaseMultiple }
            : {}),
          ...(patch.cost_price !== undefined ? { cost_price: patch.cost_price } : {}),
          ...(patch.supplier_sku !== undefined
            ? { supplier_sku: patch.supplier_sku?.trim() || null }
            : {}),
          ...(patch.is_active !== undefined ? { is_active: patch.is_active } : {}),
        })
        .eq("id", link.id);
      if (error) throw error;

      // Mantém espelho em products quando edita o primary
      if (link.is_primary && productId) {
        const productPatch: {
          purchase_multiple?: number;
          cost_price?: number | null;
        } = {};
        if (purchaseMultiple !== undefined) {
          productPatch.purchase_multiple = purchaseMultiple;
        }
        if (patch.cost_price !== undefined) {
          productPatch.cost_price = patch.cost_price;
        }
        if (Object.keys(productPatch).length > 0) {
          const { error: pErr } = await supabase
            .from("products")
            .update(productPatch)
            .eq("id", productId);
          if (pErr) throw pErr;
        }
      }
    },
    onSuccess: invalidate,
  });

  const removeLink = useMutation({
    mutationFn: async (link: ProductSupplierLink) => {
      if (link.is_primary) {
        throw new Error(
          "Defina outro fornecedor como principal antes de remover este vínculo.",
        );
      }
      const { error } = await supabase
        .from("product_suppliers")
        .delete()
        .eq("id", link.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    links: linksQuery.data ?? [],
    isLoading: linksQuery.isLoading,
    error: linksQuery.error,
    refetch: linksQuery.refetch,
    addLink,
    setPrimary,
    updateLink,
    removeLink,
  };
}

export async function searchSuppliers(companyId: string, query: string) {
  let q = supabase
    .from("suppliers")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name")
    .limit(40);

  const trimmed = query.trim();
  if (trimmed) {
    q = q.ilike("name", `%${trimmed}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
