import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Star, Trash2, Plus, Store } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import {
  searchSuppliers,
  useProductSuppliers,
  type ProductSupplierLink,
} from "@/hooks/useProductSuppliers";
import {
  useBrands,
  useCategories,
  useProductCommercial,
} from "@/hooks/useCommercialStructure";
import { ProductLogisticsPanel } from "@/components/farol/ProductLogisticsPanel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
};

type Draft = {
  lead_time_days: string;
  purchase_multiple: string;
  cost_price: string;
  supplier_sku: string;
  is_active: boolean;
};

function toDraft(link: ProductSupplierLink): Draft {
  return {
    lead_time_days: link.lead_time_days != null ? String(link.lead_time_days) : "",
    purchase_multiple: String(link.purchase_multiple ?? 1),
    cost_price: link.cost_price != null ? String(link.cost_price) : "",
    supplier_sku: link.supplier_sku ?? "",
    is_active: link.is_active,
  };
}

export function ProductSuppliersSheet({
  open,
  onOpenChange,
  productId,
  productName,
}: Props) {
  const { companyId } = useCompany();
  const { links, isLoading, addLink, setPrimary, updateLink, removeLink } =
    useProductSuppliers(open ? productId : null);
  const { brands } = useBrands();
  const { categories } = useCategories();
  const {
    brandId,
    categoryId,
    isLoading: commercialLoading,
    save: saveCommercial,
  } = useProductCommercial(open ? productId : null);

  const [draftBrandId, setDraftBrandId] = useState("");
  const [draftCategoryId, setDraftCategoryId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setDraftBrandId(brandId ?? "");
    setDraftCategoryId(categoryId ?? "");
  }, [brandId, categoryId, productId]);

  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const link of links) next[link.id] = toDraft(link);
    setDrafts(next);
  }, [links]);

  useEffect(() => {
    if (!open) {
      setSupplierQuery("");
      setSelectedSupplierId("");
      setSupplierOptions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await searchSuppliers(companyId ?? "", supplierQuery);
        if (!cancelled) setSupplierOptions(rows);
      } catch {
        if (!cancelled) toast.error("Erro ao buscar fornecedores.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, companyId, supplierQuery]);

  const linkedSupplierIds = useMemo(
    () => new Set(links.map((l) => l.supplier_id)),
    [links],
  );

  const availableOptions = supplierOptions.filter((s) => !linkedSupplierIds.has(s.id));

  const handleSaveCommercial = async () => {
    try {
      await saveCommercial.mutateAsync({
        brand_id: draftBrandId || null,
        category_id: draftCategoryId || null,
      });
      toast.success("Classificação comercial salva.");
    } catch {
      toast.error("Erro ao salvar marca/categoria.");
    }
  };

  const handleAdd = async () => {
    if (!selectedSupplierId) {
      toast.error("Selecione um fornecedor.");
      return;
    }
    try {
      await addLink.mutateAsync(selectedSupplierId);
      toast.success("Fornecedor vinculado.");
      setSelectedSupplierId("");
      setSupplierQuery("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao vincular fornecedor.");
    }
  };

  const handleSetPrimary = async (link: ProductSupplierLink) => {
    try {
      await setPrimary.mutateAsync(link);
      toast.success("Fornecedor principal atualizado.");
    } catch {
      toast.error("Erro ao definir fornecedor principal.");
    }
  };

  const handleSave = async (link: ProductSupplierLink) => {
    const draft = drafts[link.id];
    if (!draft) return;

    const multiple = Math.round(Number(draft.purchase_multiple));
    if (!Number.isFinite(multiple) || multiple < 1) {
      toast.error("Múltiplo deve ser um inteiro ≥ 1.");
      return;
    }

    let lead: number | null = null;
    if (draft.lead_time_days.trim() !== "") {
      lead = Math.round(Number(draft.lead_time_days));
      if (!Number.isFinite(lead) || lead < 0) {
        toast.error("Lead time deve ser um número ≥ 0.");
        return;
      }
    }

    let cost: number | null = null;
    if (draft.cost_price.trim() !== "") {
      cost = Number(draft.cost_price.replace(",", "."));
      if (!Number.isFinite(cost) || cost < 0) {
        toast.error("Custo inválido.");
        return;
      }
    }

    try {
      await updateLink.mutateAsync({
        link,
        patch: {
          lead_time_days: lead,
          purchase_multiple: multiple,
          cost_price: cost,
          supplier_sku: draft.supplier_sku,
          is_active: draft.is_active,
        },
      });
      toast.success("Vínculo atualizado.");
    } catch {
      toast.error("Erro ao salvar vínculo.");
    }
  };

  const handleRemove = async (link: ProductSupplierLink) => {
    try {
      await removeLink.mutateAsync(link);
      toast.success("Vínculo removido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover vínculo.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            Produto
          </SheetTitle>
          <SheetDescription className="truncate">{productName}</SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <Tabs defaultValue="fornecedores">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
              <TabsTrigger value="logistica">Logística</TabsTrigger>
            </TabsList>

            <TabsContent value="logistica" className="mt-4">
              <ProductLogisticsPanel productId={open ? productId : null} />
            </TabsContent>

            <TabsContent value="fornecedores" className="mt-4 space-y-6">
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Classificação comercial</p>
            {commercialLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Marca</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={draftBrandId}
                    onChange={(e) => setDraftBrandId(e.target.value)}
                  >
                    <option value="">Sem marca</option>
                    {brands
                      .filter((b) => b.active || b.id === draftBrandId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {!b.active ? " (inativa)" : ""}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Categoria</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={draftCategoryId}
                    onChange={(e) => setDraftCategoryId(e.target.value)}
                  >
                    <option value="">Sem categoria</option>
                    {categories
                      .filter((c) => c.active || c.id === draftCategoryId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {!c.active ? " (inativa)" : ""}
                        </option>
                      ))}
                  </select>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => void handleSaveCommercial()}
                  disabled={saveCommercial.isPending}
                >
                  Salvar classificação
                </Button>
              </>
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Adicionar fornecedor</p>
            <Input
              placeholder="Buscar fornecedor..."
              value={supplierQuery}
              onChange={(e) => setSupplierQuery(e.target.value)}
            />
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              disabled={searching}
            >
              <option value="">
                {searching ? "Buscando..." : "Selecione um fornecedor"}
              </option>
              {availableOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={() => void handleAdd()}
              disabled={addLink.isPending || !selectedSupplierId}
            >
              <Plus className="h-4 w-4" />
              Vincular
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : links.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum fornecedor vinculado.
            </p>
          ) : (
            <div className="space-y-4">
              {links.map((link) => {
                const draft = drafts[link.id] ?? toDraft(link);
                return (
                  <div key={link.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{link.supplier_name}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {link.is_primary ? (
                            <Badge className="text-[10px]">Principal</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              Alternativo
                            </Badge>
                          )}
                          <Badge
                            variant={draft.is_active ? "secondary" : "outline"}
                            className="text-[10px]"
                          >
                            {draft.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {!link.is_primary && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Definir como principal"
                            onClick={() => void handleSetPrimary(link)}
                            disabled={setPrimary.isPending}
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remover vínculo"
                          onClick={() => void handleRemove(link)}
                          disabled={removeLink.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Lead time (dias)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={draft.lead_time_days}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [link.id]: { ...draft, lead_time_days: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Múltiplo</Label>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={draft.purchase_multiple}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [link.id]: { ...draft, purchase_multiple: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Custo</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={draft.cost_price}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [link.id]: { ...draft, cost_price: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">SKU fornecedor</Label>
                        <Input
                          value={draft.supplier_sku}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [link.id]: { ...draft, supplier_sku: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={draft.is_active}
                          onCheckedChange={(checked) =>
                            setDrafts((d) => ({
                              ...d,
                              [link.id]: { ...draft, is_active: checked },
                            }))
                          }
                        />
                        <span className="text-xs text-muted-foreground">Ativo</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleSave(link)}
                        disabled={updateLink.isPending}
                      >
                        Salvar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
