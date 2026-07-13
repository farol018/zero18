import { FarolItem } from "@/hooks/useFarolInteligencia";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Package } from "lucide-react";
import { generatePurchasePdf } from "@/lib/generatePurchasePdf";

interface FarolPurchaseListProps {
  items: FarolItem[];
}

export function FarolPurchaseList({ items }: FarolPurchaseListProps) {
  const totalUnits = items.reduce((sum, i) => sum + Math.round(i.sugestao_compra ?? 0), 0);

  return (
    <section>
      <div className="rounded-lg border border-border bg-card shadow-sm">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border rounded-t-lg px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Package className="h-3.5 w-3.5" />
              Lista de compra sugerida
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {items.length} produto{items.length !== 1 ? "s" : ""} · {totalUnits} unidades
            </p>
          </div>
          <Button size="sm" className="gap-1.5 h-7 text-xs shrink-0" onClick={() => { generatePurchasePdf(items); }}>
            <ShoppingCart className="h-3 w-3" />
            Gerar lista
          </Button>
        </div>

        <div className="max-h-[240px] overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum produto precisa de compra no momento.
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {items.map((item) => (
                <div key={item.product_id} className="flex items-center justify-between px-4 py-1.5">
                  <span className="text-[13px] text-foreground truncate mr-4">{item.product_name}</span>
                  <span className="text-[13px] font-medium text-foreground tabular-nums shrink-0">
                    {Math.round(item.sugestao_compra ?? 0)} un.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
