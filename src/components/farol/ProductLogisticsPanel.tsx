import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  useProductLogistics,
  type ProductLogisticsRow,
} from "@/hooks/useProductLogistics";
import { composeLogistics } from "@/lib/composeLogistics";

type Props = {
  productId: string | null;
};

export function ProductLogisticsPanel({ productId }: Props) {
  const { levels, isLoading, create, update, reorder, remove } = useProductLogistics(productId);
  const [unitName, setUnitName] = useState("");
  const [baseUnits, setBaseUnits] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [ordered, setOrdered] = useState<ProductLogisticsRow[]>([]);

  useEffect(() => {
    setOrdered([...levels].sort((a, b) => a.level_order - b.level_order || a.base_units - b.base_units));
  }, [levels]);

  const preview = useMemo(() => {
    const active = ordered.filter((l) => l.active);
    return composeLogistics(237, active).label;
  }, [ordered]);

  const handleAdd = async () => {
    const bu = Math.round(Number(baseUnits));
    if (!unitName.trim()) {
      toast.error("Informe o nome do nível.");
      return;
    }
    if (!Number.isFinite(bu) || bu <= 0) {
      toast.error("base_units deve ser um inteiro > 0.");
      return;
    }
    try {
      const nextOrder =
        ordered.length === 0 ? 1 : Math.max(...ordered.map((l) => l.level_order)) + 1;
      await create.mutateAsync({
        unit_name: unitName.trim(),
        base_units: bu,
        level_order: nextOrder,
        active: true,
      });
      toast.success("Nível logístico adicionado.");
      setUnitName("");
      setBaseUnits("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar nível.");
    }
  };

  const handleToggle = async (row: ProductLogisticsRow, active: boolean) => {
    try {
      await update.mutateAsync({ id: row.id, active });
      toast.success(active ? "Nível reativado." : "Nível desativado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar nível.");
    }
  };

  const handleSaveRow = async (row: ProductLogisticsRow, name: string, units: string) => {
    const bu = Math.round(Number(units));
    try {
      await update.mutateAsync({
        id: row.id,
        unit_name: name,
        base_units: bu,
      });
      toast.success("Nível atualizado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar nível.");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success("Nível removido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover.");
    }
  };

  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = ordered.map((r) => r.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setOrdered(next.map((id) => ordered.find((r) => r.id === id)!).filter(Boolean));
    setDragId(null);
    try {
      await reorder.mutateAsync(next);
      toast.success("Ordem visual atualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reordenar.");
    }
  };

  if (!productId) {
    return <p className="text-sm text-muted-foreground">Selecione um produto.</p>;
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Cada nível usa <strong>unidades-base absolutas</strong>. A decomposição ignora a ordem
        visual e usa <code>base_units</code> do maior para o menor. Resto = &quot;N unidades&quot;.
      </p>

      <div className="rounded-md border border-border/60 p-2.5 space-y-2">
        <p className="text-xs font-medium">Novo nível</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Nome</Label>
            <Input
              placeholder="Caixa, Fardo…"
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">base_units</Label>
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="12"
              value={baseUnits}
              onChange={(e) => setBaseUnits(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => void handleAdd()}
          disabled={create.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar nível
        </Button>
      </div>

      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Sem logística — sugestão será só &quot;N unidades&quot;.
        </p>
      ) : (
        <div className="space-y-2">
          {ordered.map((row) => (
            <LogisticsRowEditor
              key={row.id}
              row={row}
              dragging={dragId === row.id}
              onDragStart={() => setDragId(row.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void onDrop(row.id)}
              onToggle={(active) => void handleToggle(row, active)}
              onSave={(name, units) => void handleSaveRow(row, name, units)}
              onRemove={() => void handleRemove(row.id)}
            />
          ))}
        </div>
      )}

      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Preview (237 un.): <span className="text-foreground font-medium">{preview}</span>
      </div>
    </div>
  );
}

function LogisticsRowEditor({
  row,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
  onToggle,
  onSave,
  onRemove,
}: {
  row: ProductLogisticsRow;
  dragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onToggle: (active: boolean) => void;
  onSave: (name: string, units: string) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(row.unit_name);
  const [units, setUnits] = useState(String(row.base_units));

  useEffect(() => {
    setName(row.unit_name);
    setUnits(String(row.base_units));
  }, [row.unit_name, row.base_units]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-md border p-2.5 space-y-2 ${dragging ? "opacity-60" : ""} ${
        row.active ? "border-border" : "border-dashed opacity-80"
      }`}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
        <Badge variant={row.active ? "secondary" : "outline"} className="text-[10px]">
          {row.active ? "Ativo" : "Inativo"}
        </Badge>
        <div className="flex-1" />
        <Switch checked={row.active} onCheckedChange={onToggle} />
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="number" min={1} value={units} onChange={(e) => setUnits(e.target.value)} />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full h-7 text-xs"
        onClick={() => onSave(name, units)}
      >
        Salvar nível
      </Button>
    </div>
  );
}
