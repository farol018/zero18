import { PurchaseItem } from "@/hooks/useFarolListaCompra";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Flame, AlertTriangle, X, AlertCircle } from "lucide-react";
import { generatePurchasePdf } from "@/lib/generatePurchasePdf";
import { FarolItem } from "@/hooks/useFarolInteligencia";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface PurchaseOrderViewProps {
  items: PurchaseItem[];
}

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? "").toLowerCase();

  if (s.includes("ruptura")) {
    return (
      <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[11px] gap-1">
        <X className="h-3 w-3" /> Ruptura
      </Badge>
    );
  }
  if (s.includes("risco")) {
    return (
      <Badge className="bg-destructive/10 text-destructive/80 border-destructive/15 text-[11px] gap-1">
        <AlertCircle className="h-3 w-3" /> Risco
      </Badge>
    );
  }
  if (s.includes("atenção")) {
    return (
      <Badge className="bg-warning/10 text-warning border-warning/20 text-[11px] gap-1">
        <AlertTriangle className="h-3 w-3" /> Atenção
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-[11px]">{status}</Badge>;
}

function getMicrocopy(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("ruptura")) return "Você já está sem estoque desse item";
  if (s.includes("risco")) return "Esse produto está prestes a acabar";
  if (s.includes("atenção")) return "Esse item precisa de reposição em breve";
  return "";
}

function PurchaseItemCard({ item }: { item: PurchaseItem }) {
  const qty = Math.round(item.quantidade_sugerida ?? 0);
  const dias = item.dias_cobertura != null ? Math.round(item.dias_cobertura) : null;
  const microcopy = getMicrocopy(item.status_farol);

  return (
    <Card className="border-border/60 hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-sm font-semibold text-foreground truncate">{item.product_name}</p>
                </TooltipTrigger>
                <TooltipContent>{item.product_name}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <StatusBadge status={item.status_farol ?? ""} />
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-primary tabular-nums">{qty}</p>
            <p className="text-[11px] text-muted-foreground">unidades</p>
          </div>
        </div>

        {dias != null && dias > 0 && (
          <p className="text-xs text-muted-foreground">
            Cobertura atual: {dias} dia{dias !== 1 ? "s" : ""}
          </p>
        )}

        {microcopy && (
          <p className="text-xs text-muted-foreground/80 italic">{microcopy}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function PurchaseOrderView({ items }: PurchaseOrderViewProps) {
  const urgentItems = items.filter(
    (i) => i.status === "ruptura" || i.status === "risco"
  );
  const planItems = items.filter((i) => i.status === "atencao");

  const totalProducts = items.length;
  const totalUnits = items.reduce((s, i) => s + Math.round(i.quantidade_sugerida ?? 0), 0);

  const handleGeneratePdf = () => {
    // Convert to FarolItem format for PDF generation
    const farolItems: FarolItem[] = items.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      estoque_atual: i.estoque_atual,
      consumo_medio_dia: i.consumo_dia,
      dias_estoque: i.dias_cobertura,
      status_estoque: i.status_farol,
      sugestao_compra: i.quantidade_sugerida,
      alerta: null,
      effective_status: i.status === "ruptura" ? "ruptura" : i.status === "risco" ? "risco" : "yellow",
    }));
    generatePurchasePdf(farolItems);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-lg font-medium text-muted-foreground">Nenhum item para comprar</p>
        <p className="text-sm text-muted-foreground/70">Seu estoque está em dia!</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-foreground">
              Você precisa comprar {totalProducts} produto{totalProducts !== 1 ? "s" : ""} ({totalUnits} unidades)
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Com base no seu consumo recente, para evitar ruptura
            </p>
          </div>
          <Button size="lg" className="gap-2 shrink-0" onClick={handleGeneratePdf}>
            <ShoppingCart className="h-4 w-4" />
            Gerar pedido
          </Button>
        </CardContent>
      </Card>

      {/* Urgent group */}
      {urgentItems.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-destructive" />
            <h2 className="text-base font-semibold text-destructive">Comprar agora</h2>
            <span className="text-xs text-muted-foreground">
              {urgentItems.length} produto{urgentItems.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {urgentItems.map((item) => (
              <PurchaseItemCard key={item.product_id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Plan group */}
      {planItems.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="text-base font-semibold text-warning">Planejar reposição</h2>
            <span className="text-xs text-muted-foreground">
              {planItems.length} produto{planItems.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {planItems.map((item) => (
              <PurchaseItemCard key={item.product_id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
