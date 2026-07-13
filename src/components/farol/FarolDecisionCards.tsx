import { FarolItem } from "@/hooks/useFarolInteligencia";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { StatusFilter } from "@/pages/Index";

interface FarolDecisionCardsProps {
  rupturaItems: FarolItem[];
  riscoItems: FarolItem[];
  yellowItems: FarolItem[];
  onCardClick: (status: StatusFilter) => void;
}

function DecisionCard({
  item,
  variant,
  onClick,
}: {
  item: FarolItem;
  variant: "ruptura" | "risco" | "yellow";
  onClick: () => void;
}) {
  const styles = {
    ruptura: { border: "border-destructive/40 bg-destructive/5 shadow-sm", symbol: "✕", symbolColor: "text-destructive", labelColor: "text-destructive", label: "Sem estoque", btnVariant: "destructive" as const },
    risco: { border: "border-destructive/25 bg-destructive/3", symbol: "✕", symbolColor: "text-destructive/80", labelColor: "text-destructive/80", label: `${Math.round(item.dias_estoque ?? 0)}d`, btnVariant: "destructive" as const },
    yellow: { border: "border-warning/30 bg-warning/5", symbol: "—", symbolColor: "text-warning", labelColor: "text-warning", label: `${Math.round(item.dias_estoque ?? 0)}d`, btnVariant: "outline" as const },
  };
  const s = styles[variant];

  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer transition-shadow hover:shadow-md min-w-[140px] max-w-[160px] shrink-0 ${s.border}`}
    >
      <CardContent className="p-2 space-y-1">
        <p
          className="text-xs font-semibold text-foreground truncate"
          title={item.product_name ?? ""}
        >
          {item.product_name}
        </p>
        <div className="flex items-center gap-1.5">
          <span className={`font-bold text-sm leading-none ${s.symbolColor}`}>{s.symbol}</span>
          <span className={`text-[11px] font-medium ${s.labelColor}`}>{s.label}</span>
        </div>

        {(item.sugestao_compra ?? 0) > 0 && (
          <Button
            size="sm"
            variant={s.btnVariant}
            className="w-full gap-1 h-6 text-[11px]"
            onClick={(e) => e.stopPropagation()}
          >
            <ShoppingCart className="h-3 w-3" />
            {Math.round(item.sugestao_compra!)} un.
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function FarolDecisionCards({ rupturaItems, riscoItems, yellowItems, onCardClick }: FarolDecisionCardsProps) {
  if (rupturaItems.length === 0 && riscoItems.length === 0 && yellowItems.length === 0) return null;

  const combined = [
    ...rupturaItems.map((i) => ({ item: i, variant: "ruptura" as const })),
    ...riscoItems.map((i) => ({ item: i, variant: "risco" as const })),
    ...yellowItems.map((i) => ({ item: i, variant: "yellow" as const })),
  ].slice(0, 6);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Produtos que precisam de ação</h2>
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4">
          {combined.map(({ item, variant }) => (
            <DecisionCard key={item.product_id} item={item} variant={variant} onClick={() => onCardClick(variant)} />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}
