import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import {
  canCancelPurchase,
  canConfirmPurchase,
  canDeletePurchase,
  canEditPurchase,
  type PurchaseSource,
  type PurchaseStatus,
} from "@/lib/purchaseStatus";
import { lineTotal, sumPurchaseTotal } from "@/lib/purchaseTotals";

export type Purchase = {
  id: string;
  company_id: string;
  supplier_id: string;
  supplier_name?: string | null;
  issued_at: string;
  received_at: string | null;
  invoice_number: string | null;
  invoice_series: string | null;
  total_amount: number;
  status: PurchaseStatus;
  notes: string | null;
  source: PurchaseSource;
  external_id: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  product_id: string;
  product_name?: string | null;
  product_supplier_id: string | null;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
};

export type PurchaseItemInput = {
  product_id: string;
  quantity: number;
  unit_cost: number;
  product_supplier_id?: string | null;
};

export type PurchaseDraftInput = {
  supplier_id: string;
  issued_at: string;
  received_at?: string | null;
  invoice_number?: string | null;
  invoice_series?: string | null;
  notes?: string | null;
  source?: PurchaseSource;
  external_id?: string | null;
  items: PurchaseItemInput[];
};

function assertDraft(status: PurchaseStatus) {
  if (!canEditPurchase(status)) {
    throw new Error("Compra confirmada ou cancelada não pode ser editada. Cancele e crie uma nova.");
  }
}

async function fetchPurchaseStatus(id: string): Promise<PurchaseStatus> {
  const { data, error } = await supabase.from("purchases").select("status").eq("id", id).single();
  if (error) throw error;
  return data.status as PurchaseStatus;
}

export function usePurchasesList(statusFilter: PurchaseStatus | "all" = "all") {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["purchases", companyId, statusFilter],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<Purchase[]> => {
      if (!companyId) throw new Error("Empresa não resolvida.");
      let q = supabase
        .from("purchases")
        .select("id, company_id, supplier_id, issued_at, received_at, invoice_number, invoice_series, total_amount, status, notes, source, external_id, created_at, updated_at")
        .eq("company_id", companyId)
        .order("issued_at", { ascending: false });

      if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];

      const supplierIds = [...new Set(rows.map((r) => r.supplier_id))];
      const purchaseIds = rows.map((r) => r.id);

      const [{ data: suppliers }, { data: items }] = await Promise.all([
        supabase.from("suppliers").select("id, name").in("id", supplierIds),
        supabase.from("purchase_items").select("purchase_id").in("purchase_id", purchaseIds),
      ]);

      const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
      const countMap = new Map<string, number>();
      for (const item of items ?? []) {
        countMap.set(item.purchase_id, (countMap.get(item.purchase_id) ?? 0) + 1);
      }

      return rows.map((r) => ({
        ...r,
        status: r.status as PurchaseStatus,
        source: r.source as PurchaseSource,
        total_amount: Number(r.total_amount ?? 0),
        supplier_name: supplierMap.get(r.supplier_id) ?? "Sem fornecedor",
        item_count: countMap.get(r.id) ?? 0,
      }));
    },
  });
}

export function usePurchase(purchaseId: string | null) {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ["purchase", companyId, purchaseId],
    enabled: Boolean(companyId && purchaseId),
    queryFn: async (): Promise<{ purchase: Purchase; items: PurchaseItem[] }> => {
      if (!companyId || !purchaseId) throw new Error("Empresa ou compra inválida.");
      const { data: purchase, error } = await supabase
        .from("purchases")
        .select("*")
        .eq("id", purchaseId)
        .eq("company_id", companyId)
        .single();
      if (error) throw error;

      const [{ data: supplier }, { data: items }] = await Promise.all([
        supabase.from("suppliers").select("id, name").eq("id", purchase.supplier_id).maybeSingle(),
        supabase
          .from("purchase_items")
          .select("id, purchase_id, product_id, product_supplier_id, quantity, unit_cost, total_cost, created_at")
          .eq("purchase_id", purchase.id)
          .order("created_at"),
      ]);

      const productIds = [...new Set((items ?? []).map((i) => i.product_id))];
      const { data: products } =
        productIds.length > 0
          ? await supabase.from("products").select("id, name").in("id", productIds)
          : { data: [] as { id: string; name: string | null }[] };

      const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));

      return {
        purchase: {
          ...purchase,
          status: purchase.status as PurchaseStatus,
          source: purchase.source as PurchaseSource,
          total_amount: Number(purchase.total_amount ?? 0),
          supplier_name: supplier?.name ?? "Sem fornecedor",
        },
        items: (items ?? []).map((i) => ({
          ...i,
          quantity: Number(i.quantity),
          unit_cost: Number(i.unit_cost),
          total_cost: Number(i.total_cost),
          product_name: productMap.get(i.product_id) ?? "Produto",
        })),
      };
    },
  });
}

export function usePurchaseMutations() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["purchases", companyId] });
    void queryClient.invalidateQueries({ queryKey: ["purchase", companyId] });
  };

  const createDraft = useMutation({
    mutationFn: async (input: PurchaseDraftInput) => {
      if (!companyId) throw new Error("Empresa não resolvida. Faça login novamente.");
      if (!input.supplier_id) throw new Error("Selecione o fornecedor.");
      if (!input.items.length) throw new Error("Inclua ao menos um produto.");

      const total = sumPurchaseTotal(input.items);
      const { data: purchase, error } = await supabase
        .from("purchases")
        .insert({
          company_id: companyId,
          supplier_id: input.supplier_id,
          issued_at: input.issued_at,
          received_at: input.received_at || null,
          invoice_number: input.invoice_number?.trim() || null,
          invoice_series: input.invoice_series?.trim() || null,
          notes: input.notes?.trim() || null,
          total_amount: total,
          status: "draft",
          source: input.source ?? "manual",
          external_id: input.external_id?.trim() || null,
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("Esta NFe já foi importada.");
        throw error;
      }

      const rows = input.items.map((item) => ({
        purchase_id: purchase.id,
        product_id: item.product_id,
        product_supplier_id: item.product_supplier_id ?? null,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: lineTotal(item.quantity, item.unit_cost),
      }));

      const { error: itemsError } = await supabase.from("purchase_items").insert(rows);
      if (itemsError) {
        await supabase.from("purchases").delete().eq("id", purchase.id);
        throw itemsError;
      }

      return purchase.id as string;
    },
    onSuccess: invalidate,
  });

  const updateDraft = useMutation({
    mutationFn: async (input: { id: string } & PurchaseDraftInput) => {
      if (!companyId) throw new Error("Empresa não resolvida. Faça login novamente.");
      const status = await fetchPurchaseStatus(input.id);
      assertDraft(status);
      if (!input.supplier_id) throw new Error("Selecione o fornecedor.");
      if (!input.items.length) throw new Error("Inclua ao menos um produto.");

      const total = sumPurchaseTotal(input.items);
      const { error } = await supabase
        .from("purchases")
        .update({
          supplier_id: input.supplier_id,
          issued_at: input.issued_at,
          received_at: input.received_at || null,
          invoice_number: input.invoice_number?.trim() || null,
          notes: input.notes?.trim() || null,
          total_amount: total,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("company_id", companyId);
      if (error) throw error;

      const { error: delError } = await supabase.from("purchase_items").delete().eq("purchase_id", input.id);
      if (delError) throw delError;

      const rows = input.items.map((item) => ({
        purchase_id: input.id,
        product_id: item.product_id,
        product_supplier_id: item.product_supplier_id ?? null,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: lineTotal(item.quantity, item.unit_cost),
      }));
      const { error: itemsError } = await supabase.from("purchase_items").insert(rows);
      if (itemsError) throw itemsError;
    },
    onSuccess: invalidate,
  });

  const confirmPurchase = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não resolvida. Faça login novamente.");
      const status = await fetchPurchaseStatus(id);
      if (!canConfirmPurchase(status)) throw new Error("Somente rascunhos podem ser confirmados.");
      const { error } = await supabase
        .from("purchases")
        .update({ status: "confirmed", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const cancelPurchase = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não resolvida. Faça login novamente.");
      const status = await fetchPurchaseStatus(id);
      if (!canCancelPurchase(status)) throw new Error("Somente compras confirmadas podem ser canceladas.");
      const { error } = await supabase
        .from("purchases")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteDraft = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não resolvida. Faça login novamente.");
      const status = await fetchPurchaseStatus(id);
      if (!canDeletePurchase(status)) throw new Error("Somente rascunhos podem ser excluídos.");
      const { error } = await supabase.from("purchases").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { createDraft, updateDraft, confirmPurchase, cancelPurchase, deleteDraft };
}

export function useSuppliersOptions() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["suppliers-options", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) throw new Error("Empresa não resolvida.");
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProductsOptions() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["products-options", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) throw new Error("Empresa não resolvida.");
      const { data, error } = await supabase
        .from("products")
        .select("id, name, cost_price, sku")
        .eq("company_id", companyId)
        .order("name")
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });
}
