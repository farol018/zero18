import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Package } from "lucide-react";

interface InlineMultipleInputProps {
  productId: string;
  currentValue: number;
  compact?: boolean;
}

export function InlineMultipleInput({ productId, currentValue, compact }: InlineMultipleInputProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setValue(currentValue);
  }, [currentValue]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async (newVal: number) => {
    if (newVal < 1 || !Number.isInteger(newVal) || newVal === currentValue) {
      setValue(currentValue);
      setEditing(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({ purchase_multiple: newVal })
      .eq("id", productId);

    if (error) {
      toast.error("Erro ao salvar múltiplo.");
      setValue(currentValue);
    } else {
      toast.success("Múltiplo atualizado com sucesso");
      await queryClient.invalidateQueries({ queryKey: ["farol"], refetchType: "all" });
    }
    setSaving(false);
    setEditing(false);
  };

  const handleBlur = () => {
    const parsed = Math.max(1, Math.round(value));
    save(parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      setValue(currentValue);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="number"
          min={1}
          step={1}
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value, 10) || 1)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className={`tabular-nums text-center border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 ${
            compact ? "w-12 h-6 text-[12px]" : "w-14 h-7 text-sm"
          }`}
        />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className={`inline-flex items-center gap-1 tabular-nums rounded px-1.5 py-0.5 hover:bg-accent transition-colors cursor-pointer ${
              compact ? "text-[12px]" : "text-sm"
            } ${currentValue > 1 ? "text-primary font-medium" : "text-muted-foreground"}`}
          >
            {currentValue > 1 ? (
              <>
                <Package className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
                {currentValue}
              </>
            ) : (
              <span>—</span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Editar múltiplo de compra</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
