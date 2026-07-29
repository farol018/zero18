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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Tags } from "lucide-react";
import { useBrands, useCategories } from "@/hooks/useCommercialStructure";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommercialCatalogSheet({ open, onOpenChange }: Props) {
  const { brands, create: createBrand, update: updateBrand } = useBrands();
  const { categories, create: createCategory, update: updateCategory } = useCategories();

  const [brandName, setBrandName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryParentId, setCategoryParentId] = useState("");

  useEffect(() => {
    if (!open) {
      setBrandName("");
      setCategoryName("");
      setCategoryParentId("");
    }
  }, [open]);

  const parentOptions = useMemo(
    () => categories.filter((c) => c.active),
    [categories],
  );

  const handleCreateBrand = async () => {
    try {
      await createBrand.mutateAsync(brandName);
      toast.success("Marca criada.");
      setBrandName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar marca.");
    }
  };

  const handleCreateCategory = async () => {
    try {
      await createCategory.mutateAsync({
        name: categoryName,
        parent_id: categoryParentId || null,
      });
      toast.success("Categoria criada.");
      setCategoryName("");
      setCategoryParentId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar categoria.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Tags className="h-4 w-4" />
            Estrutura comercial
          </SheetTitle>
          <SheetDescription>
            Cadastro de marcas e categorias (compatível com BLING).
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="brands" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="brands">Marcas</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
          </TabsList>

          <TabsContent value="brands" className="space-y-4 mt-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nova marca..."
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
              <Button
                size="sm"
                className="gap-1 shrink-0"
                onClick={() => void handleCreateBrand()}
                disabled={createBrand.isPending}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            <div className="space-y-2">
              {brands.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhuma marca cadastrada.
                </p>
              ) : (
                brands.map((brand) => (
                  <div
                    key={brand.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="text-sm truncate">{brand.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={brand.active}
                        onCheckedChange={(checked) =>
                          void updateBrand
                            .mutateAsync({ id: brand.id, active: checked })
                            .then(() => toast.success("Marca atualizada."))
                            .catch(() => toast.error("Erro ao atualizar marca."))
                        }
                      />
                      <span className="text-[11px] text-muted-foreground w-12">
                        {brand.active ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Input
                placeholder="Nova categoria..."
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
              />
              <div className="space-y-1">
                <Label className="text-xs">Categoria pai (opcional)</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={categoryParentId}
                  onChange={(e) => setCategoryParentId(e.target.value)}
                >
                  <option value="">Sem pai (raiz)</option>
                  {parentOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.external_id ? ` · BLING ${c.external_id}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                className="w-full gap-1"
                onClick={() => void handleCreateCategory()}
                disabled={createCategory.isPending}
              >
                <Plus className="h-4 w-4" />
                Adicionar categoria
              </Button>
            </div>

            <div className="space-y-2">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhuma categoria cadastrada.
                </p>
              ) : (
                categories.map((cat) => {
                  const parent = categories.find((c) => c.id === cat.parent_id);
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate">{cat.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {parent ? `Pai: ${parent.name}` : "Raiz"}
                          {cat.external_id ? ` · BLING ${cat.external_id}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={cat.active}
                          onCheckedChange={(checked) =>
                            void updateCategory
                              .mutateAsync({ id: cat.id, active: checked })
                              .then(() => toast.success("Categoria atualizada."))
                              .catch(() => toast.error("Erro ao atualizar categoria."))
                          }
                        />
                        <span className="text-[11px] text-muted-foreground w-12">
                          {cat.active ? "Ativa" : "Inativa"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
