import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface PurchaseMultipleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  currentMultiple: number;
}

export function PurchaseMultipleDialog({
  open,
  onOpenChange,
  productId,
  productName,
  currentMultiple,
}: PurchaseMultipleDialogProps) {
  const [value, setValue] = useState(currentMultiple);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) setValue(currentMultiple);
  }, [open, currentMultiple]);

  const handleSave = async () => {
    if (value < 1 || !Number.isInteger(value)) {
      toast.error("O múltiplo deve ser um número inteiro maior ou igual a 1.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({ purchase_multiple: value })
      .eq("id", productId);

    if (error) {
      toast.error("Erro ao salvar múltiplo de compra.");
    } else {
      toast.success("Múltiplo de compra atualizado!");
      await queryClient.invalidateQueries({ queryKey: ["farol_stock_analysis"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["farol_pedido_fornecedor"], refetchType: "all" });
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Múltiplo de compra
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground truncate" title={productName}>
            <span className="font-medium text-foreground">{productName}</span>
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="purchase-multiple">Múltiplo de compra</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px]">
                  Informe como o fornecedor vende este produto (ex: 6, 12, 24)
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="purchase-multiple"
              type="number"
              min={1}
              step={1}
              value={value}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setValue(v);
              }}
              className="w-32"
            />
          </div>

          {value > 1 && (
            <p className="text-xs text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
              Este produto será sugerido em caixas de <strong>{value} unidades</strong>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
