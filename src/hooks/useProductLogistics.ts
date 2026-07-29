import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import {
  composeLogistics,
  validateLogisticsLevels,
  type LogisticsLevel,
} from "@/lib/composeLogistics";

export type ProductLogisticsRow = {
  id: string;
  company_id: string;
  product_id: string;
  unit_name: string;
  base_units: number;
  level_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductLogisticsInput = {
  unit_name: string;
  base_units: number;
  level_order: number;
  active?: boolean;
};

function toLevel(row: ProductLogisticsRow): LogisticsLevel {
  return {
    unit_name: row.unit_name,
    base_units: row.base_units,
    active: row.active,
    level_order: row.level_order,
  };
}

export function useProductLogistics(productId: string | null) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const key = ["product_logistics", companyId, productId];

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(companyId && productId),
    queryFn: async (): Promise<ProductLogisticsRow[]> => {
      if (!companyId || !productId) throw new Error("Empresa ou produto inválido.");
      const { data, error } = await supabase
        .from("product_logistics")
        .select("*")
        .eq("company_id", companyId)
        .eq("product_id", productId)
        .order("level_order", { ascending: true })
        .order("base_units", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        base_units: Number(r.base_units),
        level_order: Number(r.level_order),
      }));
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: async (input: ProductLogisticsInput) => {
      if (!companyId || !productId) throw new Error("Empresa ou produto inválido.");
      const next: LogisticsLevel[] = [
        ...(query.data ?? []).map(toLevel),
        {
          unit_name: input.unit_name,
          base_units: input.base_units,
          active: input.active ?? true,
          level_order: input.level_order,
        },
      ];
      const validation = validateLogisticsLevels(next);
      if (!validation.ok) throw new Error(validation.error);

      const { error } = await supabase.from("product_logistics").insert({
        company_id: companyId,
        product_id: productId,
        unit_name: input.unit_name.trim(),
        base_units: input.base_units,
        level_order: input.level_order,
        active: input.active ?? true,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Nível duplicado (nome ou base_units).");
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      unit_name?: string;
      base_units?: number;
      level_order?: number;
      active?: boolean;
    }) => {
      if (!companyId || !productId) throw new Error("Empresa ou produto inválido.");
      const current = query.data ?? [];
      const next = current.map((row) => {
        if (row.id !== input.id) return toLevel(row);
        return {
          unit_name: input.unit_name ?? row.unit_name,
          base_units: input.base_units ?? row.base_units,
          active: input.active ?? row.active,
          level_order: input.level_order ?? row.level_order,
        };
      });
      const validation = validateLogisticsLevels(next);
      if (!validation.ok) throw new Error(validation.error);

      const { error } = await supabase
        .from("product_logistics")
        .update({
          ...(input.unit_name !== undefined ? { unit_name: input.unit_name.trim() } : {}),
          ...(input.base_units !== undefined ? { base_units: input.base_units } : {}),
          ...(input.level_order !== undefined ? { level_order: input.level_order } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("company_id", companyId);
      if (error) {
        if (error.code === "23505") throw new Error("Nível duplicado (nome ou base_units).");
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!companyId || !productId) throw new Error("Empresa ou produto inválido.");
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
          .from("product_logistics")
          .update({ level_order: i + 1, updated_at: new Date().toISOString() })
          .eq("id", orderedIds[i])
          .eq("company_id", companyId);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Empresa não resolvida.");
      const { error } = await supabase
        .from("product_logistics")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    levels: query.data ?? [],
    isLoading: query.isLoading,
    create,
    update,
    reorder,
    remove,
  };
}

/** Mapa product_id → níveis ativos (para Lista de Compra / Compras). */
export function useProductLogisticsMap(productIds: string[]) {
  const { companyId } = useCompany();
  const unique = [...new Set(productIds.filter(Boolean))];

  return useQuery({
    queryKey: ["product_logistics_map", companyId, unique.sort().join(",")],
    enabled: Boolean(companyId && unique.length > 0),
    queryFn: async (): Promise<Map<string, LogisticsLevel[]>> => {
      if (!companyId) throw new Error("Empresa não resolvida.");
      const map = new Map<string, LogisticsLevel[]>();
      const chunkSize = 200;
      for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("product_logistics")
          .select("product_id, unit_name, base_units, level_order, active")
          .eq("company_id", companyId)
          .in("product_id", chunk)
          .eq("active", true);
        if (error) throw error;
        for (const row of data ?? []) {
          const list = map.get(row.product_id) ?? [];
          list.push({
            unit_name: row.unit_name,
            base_units: Number(row.base_units),
            active: row.active,
            level_order: Number(row.level_order),
          });
          map.set(row.product_id, list);
        }
      }
      return map;
    },
    staleTime: 60_000,
  });
}

export function logisticsLabelFor(
  quantity: number,
  levels: LogisticsLevel[] | undefined,
): string {
  return composeLogistics(quantity, levels ?? []).label;
}
