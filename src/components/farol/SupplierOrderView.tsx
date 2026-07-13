import type { FarolItem, SupplierGroup } from "@/hooks/useFarol";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ShoppingCart, Copy, Check, Store, X, AlertCircle, AlertTriangle, ChevronRight, FileText, ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { generateSupplierPdf } from "@/lib/generateSupplierPdf";
import { formatProductLabel } from "@/lib/formatProduct";

const PAGE_SIZE = 10;

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("ruptura")) {
    return (
      <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[11px] gap-1 px-1.5 py-0.5">
        <X className="h-3 w-3" /> Ruptura
      </Badge>
    );
  }
  if (s.includes("risco")) {
    return (
      <Badge className="bg-destructive/10 text-destructive/80 border-destructive/15 text-[11px] gap-1 px-1.5 py-0.5">
        <AlertCircle className="h-3 w-3" /> Risco
      </Badge>
    );
  }
  if (s.includes("atenção")) {
    return (
      <Badge className="bg-warning/10 text-warning border-warning/20 text-[11px] gap-1 px-1.5 py-0.5">
        <AlertTriangle className="h-3 w-3" /> Atenção
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-[11px]">{status}</Badge>;
}

function generateOrderText(group: SupplierGroup): string {
  const lines = [`Pedido de compra — ${group.supplier_name}\n`];
  for (const item of group.items) {
    const qty = Math.round(item.sugestao_compra ?? 0);
    lines.push(`• ${formatProductLabel(item)} — ${qty} un.`);
  }
  lines.push(`\nTotal: ${group.totalUnits} unidades`);
  return lines.join("\n");
}

function SupplierItemRow({ item }: { item: FarolItem }) {
  const qty = Math.round(item.sugestao_compra ?? 0);
  const mult = item.purchase_multiple ?? 1;
  const cost = item.cost_price;
  const totalCost = cost != null ? qty * cost : null;
  const isRuptura = (item.status_estoque ?? "").toLowerCase().includes("ruptura");

  return (
    <div className={`flex items-center justify-between gap-3 py-2 px-3 rounded-md ${isRuptura ? "bg-destructive/5" : "hover:bg-muted/40"} transition-colors`}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <StatusBadge status={item.status_estoque ?? ""} />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-foreground truncate">
                {formatProductLabel(item)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{formatProductLabel(item)}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center shrink-0 whitespace-nowrap min-w-[120px] text-right">
        <span className="text-base font-bold text-primary tabular-nums">{qty}</span>
        <span className="text-[11px] text-muted-foreground ml-1">un.</span>
        {mult > 1 && (
          <span className="text-[11px] text-muted-foreground/70 ml-1">| {Math.ceil(qty / mult)} cx</span>
        )}
        {totalCost != null && (
          <span className="text-[11px] text-muted-foreground/60 ml-1.5">• {totalCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
        )}
      </div>
    </div>
  );
}

function SupplierRow({ group }: { group: SupplierGroup }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const totalCost = group.items.reduce((sum, item) => {
    const qty = Math.round(item.sugestao_compra ?? 0);
    const cost = item.cost_price;
    return cost != null ? sum + qty * cost : sum;
  }, 0);
  const hasCost = group.items.some(i => i.cost_price != null);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = generateOrderText(group);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Pedido copiado!", description: "Cole no WhatsApp ou e-mail." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = generateOrderText(group);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const hasRuptura = group.items.some(i => (i.status_estoque ?? "").toLowerCase().includes("ruptura"));
  const hasRisco = !hasRuptura && group.items.some(i => (i.status_estoque ?? "").toLowerCase().includes("risco"));
  const hasAtencao = !hasRuptura && !hasRisco && group.items.some(i => (i.status_estoque ?? "").toLowerCase().includes("atenção"));

  const urgentCount = group.items.filter(i => {
    const s = (i.status_estoque ?? "").toLowerCase();
    return s.includes("ruptura") || s.includes("risco");
  }).length;

  const borderClass = hasRuptura
    ? "border-destructive/40 bg-destructive/[0.03]"
    : hasRisco
      ? "border-orange-400/40 bg-orange-50/30 dark:bg-orange-950/10"
      : hasAtencao
        ? "border-yellow-400/40 bg-yellow-50/30 dark:bg-yellow-950/10"
        : "border-border/60 bg-card";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-lg border transition-colors ${borderClass}`}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[80px] text-left hover:bg-muted/30 transition-colors rounded-t-lg">
            <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
            <Store className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{group.supplier_name}</p>
              <p className="text-xs text-muted-foreground">
                {group.items.length} produto{group.items.length !== 1 ? "s" : ""} · {group.totalUnits} un.
                {hasCost && (
                  <span className="font-medium"> · {totalCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                )}
                {urgentCount > 0 && (
                  <span className="text-destructive font-medium"> · {urgentCount} urgente{urgentCount !== 1 ? "s" : ""}</span>
                )}
              </p>
              {hasRuptura && (
                <p className="text-[11px] text-destructive mt-0.5 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Contém itens sem estoque
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCopy}>
                      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copiar pedido</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleWhatsApp}>
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Enviar por WhatsApp</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); generateSupplierPdf(group); }}>
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Gerar PDF</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-3 pt-1 space-y-0.5 border-t border-border/30">
            {group.items.map((item) => (
              <SupplierItemRow key={item.product_id} item={item} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface SupplierOrderViewProps {
  groups: SupplierGroup[];
}

export function SupplierOrderView({ groups }: SupplierOrderViewProps) {
  const [page, setPage] = useState(1);
  const totalProducts = groups.reduce((s, g) => s + g.items.length, 0);
  const totalUnits = groups.reduce((s, g) => s + g.totalUnits, 0);
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [groups.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageGroups = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return groups.slice(start, start + PAGE_SIZE);
  }, [groups, page]);

  if (totalProducts === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-lg font-medium text-muted-foreground">Nenhum item para comprar</p>
        <p className="text-sm text-muted-foreground/70">Seu estoque está em dia!</p>
      </div>
    );
  }

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, groups.length);

  return (
    <div className="space-y-4">
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <p className="text-base font-semibold text-foreground">
            Você precisa comprar {totalProducts} produto{totalProducts !== 1 ? "s" : ""} ({totalUnits} unidades)
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Dividido em {groups.length} fornecedor{groups.length !== 1 ? "es" : ""} — expanda para ver os itens
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {pageGroups.map((group) => (
          <SupplierRow key={group.supplier_id} group={group} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            Fornecedores {from}–{to} de {groups.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground min-w-[4.5rem] text-center">
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
