import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export type Brand = {
  id: string;
  company_id: string;
  name: string;
  active: boolean;
};

export type Category = {
  id: string;
  company_id: string;
  name: string;
  external_id: string | null;
  parent_id: string | null;
  active: boolean;
};

export function useBrands() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["brands", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<Brand[]> => {
      if (!companyId) throw new Error("Empresa não resolvida.");
      const { data, error } = await supabase
        .from("brands")
        .select("id, company_id, name, active")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      if (!companyId) throw new Error("Empresa não resolvida.");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Informe o nome da marca.");
      const { error } = await supabase.from("brands").insert({
        company_id: companyId,
        name: trimmed,
        active: true,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Já existe uma marca com este nome.");
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brands", companyId] }),
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; name?: string; active?: boolean }) => {
      const { error } = await supabase
        .from("brands")
        .update({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) {
        if (error.code === "23505") throw new Error("Já existe uma marca com este nome.");
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brands", companyId] }),
  });

  return { brands: query.data ?? [], isLoading: query.isLoading, create, update };
}

export function useCategories() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["categories", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<Category[]> => {
      if (!companyId) throw new Error("Empresa não resolvida.");
      const { data, error } = await supabase
        .from("categories")
        .select("id, company_id, name, external_id, parent_id, active")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (input: { name: string; parent_id?: string | null }) => {
      if (!companyId) throw new Error("Empresa não resolvida.");
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error("Informe o nome da categoria.");
      const { error } = await supabase.from("categories").insert({
        company_id: companyId,
        name: trimmed,
        parent_id: input.parent_id || null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories", companyId] }),
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      parent_id?: string | null;
      active?: boolean;
    }) => {
      const { error } = await supabase
        .from("categories")
        .update({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.parent_id !== undefined ? { parent_id: input.parent_id } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories", companyId] }),
  });

  return { categories: query.data ?? [], isLoading: query.isLoading, create, update };
}

export function useProductCommercial(productId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["product_commercial", productId],
    enabled: Boolean(productId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, brand_id, category_id")
        .eq("id", productId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (input: {
      brand_id: string | null;
      category_id: string | null;
    }) => {
      if (!productId) throw new Error("Produto inválido");
      const { error } = await supabase
        .from("products")
        .update({
          brand_id: input.brand_id,
          category_id: input.category_id,
        })
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["product_commercial", productId] });
      await queryClient.invalidateQueries({ queryKey: ["farol"], refetchType: "all" });
    },
  });

  return {
    brandId: query.data?.brand_id ?? null,
    categoryId: query.data?.category_id ?? null,
    isLoading: query.isLoading,
    save,
  };
}
