import type { FarolItem, SupplierGroup } from "@/hooks/useFarol";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  ShoppingCart,
  Copy,
  Check,
  Store,
  X,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  FileText,
  Tags,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { generateSupplierPdf } from "@/lib/generateSupplierPdf";
import { formatProductLabel } from "@/lib/formatProduct";
import {
  buildFarolPurchaseSeed,
  type FarolPurchaseSeed,
} from "@/lib/purchaseImport/buildFarolPurchaseSeed";
import {
  buildPurchaseListHierarchy,
  flattenPurchaseGroups,
  itemPurchaseMetrics,
  type CategoryBucket,
  type PurchaseSortMode,
  type SupplierBucket,
} from "@/lib/purchaseListGrouping";
import {
  logisticsLabelFor,
  useProductLogisticsMap,
} from "@/hooks/useProductLogistics";
import type { LogisticsLevel } from "@/lib/composeLogistics";

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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

function generateOrderText(
  group: SupplierBucket,
  logisticsMap?: Map<string, LogisticsLevel[]>,
) {
  const lines = [`Pedido de compra — ${group.supplier_name}\n`];
  for (const item of group.items) {
    const qty = Math.round(item.sugestao_compra ?? 0);
    const logistics = logisticsLabelFor(qty, logisticsMap?.get(item.product_id));
    lines.push(`• ${formatProductLabel(item)} — ${qty} un. (${logistics})`);
  }
  lines.push(`\nTotal: ${group.totalUnits} unidades`);
  if (group.totalValue > 0) lines.push(`Valor: ${money(group.totalValue)}`);
  return lines.join("\n");
}

function SupplierItemRow({
  item,
  logisticsMap,
  checked,
  onCheckedChange,
}: {
  item: FarolItem;
  logisticsMap?: Map<string, LogisticsLevel[]>;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { qty, boxes, value } = itemPurchaseMetrics(item);
  const isRuptura = (item.status_estoque ?? "").toLowerCase().includes("ruptura");
  const logistics = logisticsLabelFor(qty, logisticsMap?.get(item.product_id));

  return (
    <div
      className={`flex items-center justify-between gap-3 py-2 px-3 rounded-md ${
        isRuptura ? "bg-destructive/5" : "hover:bg-muted/40"
      } transition-colors`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Selecionar ${formatProductLabel(item)}`}
        />
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
      <div className="flex flex-col items-end shrink-0 min-w-[140px] text-right gap-0.5">
        <div className="flex items-center whitespace-nowrap">
          <span className="text-base font-bold text-primary tabular-nums">{qty}</span>
          <span className="text-[11px] text-muted-foreground ml-1">un.</span>
          {boxes > 0 && (
            <span className="text-[11px] text-muted-foreground/70 ml-1">| {boxes} cx</span>
          )}
          {value > 0 && (
            <span className="text-[11px] text-muted-foreground/60 ml-1.5">• {money(value)}</span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground leading-tight max-w-[220px]">
          Sugestão logística: {logistics}
        </span>
      </div>
    </div>
  );
}

function SupplierBlock({
  group,
  logisticsMap,
  selectedProductIds,
  onToggleProduct,
  onGeneratePurchase,
}: {
  group: SupplierBucket;
  logisticsMap?: Map<string, LogisticsLevel[]>;
  selectedProductIds: Set<string>;
  onToggleProduct: (productId: string) => void;
  onGeneratePurchase?: (seed: FarolPurchaseSeed) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const canGenerate =
    Boolean(group.supplier_id) && group.supplier_id !== "sem-fornecedor";

  const handleGenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canGenerate || !group.supplier_id) return;

    const pool =
      selectedProductIds.size > 0
        ? group.items.filter((item) => selectedProductIds.has(item.product_id))
        : group.items;

    const result = buildFarolPurchaseSeed({
      supplierId: group.supplier_id,
      supplierName: group.supplier_name ?? "Fornecedor",
      items: pool,
      issuedAt: new Date().toISOString().slice(0, 10),
    });

    if (!result.ok) {
      toast({
        title: "Nenhum item elegível",
        description: "Itens sem custo ou quantidade inválida.",
        variant: "destructive",
      });
      return;
    }

    if (result.seed.skippedNoCost > 0) {
      toast({
        title: "Itens omitidos",
        description: `${result.seed.skippedNoCost} sem custo ficaram de fora.`,
      });
    }

    if (result.seed.skippedNonPositiveQty > 0) {
      toast({
        title: "Itens omitidos",
        description: `${result.seed.skippedNonPositiveQty} com quantidade inválida ficaram de fora.`,
      });
    }

    onGeneratePurchase?.(result.seed);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(generateOrderText(group, logisticsMap));
    setCopied(true);
    toast({ title: "Pedido copiado!", description: "Cole no WhatsApp ou e-mail." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(
      `https://wa.me/?text=${encodeURIComponent(generateOrderText(group, logisticsMap))}`,
      "_blank",
    );
  };

  const pdfGroup: SupplierGroup = {
    supplier_id: group.supplier_id,
    supplier_name: group.supplier_name,
    items: group.items,
    totalUnits: group.totalUnits,
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border/60 bg-card">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors">
            <ChevronRight
              className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
            />
            <Store className="h-3.5 w-3.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{group.supplier_name}</p>
              <p className="text-[11px] text-muted-foreground">
                {group.itemCount} item{group.itemCount !== 1 ? "s" : ""} · {group.totalUnits} un.
                {group.totalBoxes > 0 ? ` · ${group.totalBoxes} cx` : ""}
                {group.totalValue > 0 ? ` · ${money(group.totalValue)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {canGenerate && onGeneratePurchase && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 px-2"
                  onClick={handleGenerate}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Gerar compra
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleWhatsApp}>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => generateSupplierPdf(pdfGroup)}
              >
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-2 pt-1 space-y-0.5 border-t border-border/30">
            {group.items.map((item) => (
              <SupplierItemRow
                key={item.product_id}
                item={item}
                logisticsMap={logisticsMap}
                checked={selectedProductIds.has(item.product_id)}
                onCheckedChange={() => onToggleProduct(item.product_id)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function CategoryBlock({
  category,
  defaultOpen,
  logisticsMap,
  selectedBySupplier,
  onToggleProduct,
  onGeneratePurchase,
}: {
  category: CategoryBucket;
  defaultOpen: boolean;
  logisticsMap?: Map<string, LogisticsLevel[]>;
  selectedBySupplier: Record<string, Set<string>>;
  onToggleProduct: (supplierId: string, productId: string) => void;
  onGeneratePurchase?: (seed: FarolPurchaseSeed) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border bg-card/60">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-t-lg">
            <ChevronRight
              className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
            />
            <Tags className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{category.category_name}</p>
              <p className="text-xs text-muted-foreground">
                {category.suppliers.length} fornecedor{category.suppliers.length !== 1 ? "es" : ""} ·{" "}
                {category.itemCount} item{category.itemCount !== 1 ? "s" : ""} · {category.totalUnits} un.
                {category.totalBoxes > 0 ? ` · ${category.totalBoxes} cx` : ""}
                {category.totalValue > 0 ? ` · ${money(category.totalValue)}` : ""}
              </p>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/40">
            {category.suppliers.map((supplier) => (
              <SupplierBlock
                key={`${category.category_id}-${supplier.supplier_id}`}
                group={supplier}
                logisticsMap={logisticsMap}
                selectedProductIds={selectedBySupplier[supplier.supplier_id] ?? new Set()}
                onToggleProduct={(productId) =>
                  onToggleProduct(supplier.supplier_id, productId)
                }
                onGeneratePurchase={onGeneratePurchase}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface SupplierOrderViewProps {
  groups: SupplierGroup[];
  onGeneratePurchase?: (seed: FarolPurchaseSeed) => void;
}

const SORT_OPTIONS: { value: PurchaseSortMode; label: string }[] = [
  { value: "priority", label: "Prioridade" },
  { value: "category", label: "Categoria" },
  { value: "supplier", label: "Fornecedor" },
  { value: "value", label: "Valor" },
];

export function SupplierOrderView({ groups, onGeneratePurchase }: SupplierOrderViewProps) {
  const [sortMode, setSortMode] = useState<PurchaseSortMode>("priority");
  const [selectedBySupplier, setSelectedBySupplier] = useState<Record<string, Set<string>>>({});

  const toggleProductSelection = (supplierId: string, productId: string) => {
    setSelectedBySupplier((prev) => {
      const current = new Set(prev[supplierId] ?? []);
      if (current.has(productId)) current.delete(productId);
      else current.add(productId);
      return { ...prev, [supplierId]: current };
    });
  };

  const items = useMemo(() => flattenPurchaseGroups(groups), [groups]);
  const productIds = useMemo(() => items.map((i) => i.product_id), [items]);
  const logisticsQuery = useProductLogisticsMap(productIds);
  const logisticsMap = logisticsQuery.data;

  const { categories, totals } = useMemo(
    () => buildPurchaseListHierarchy(items, sortMode),
    [items, sortMode],
  );

  if (totals.itemCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-lg font-medium text-muted-foreground">Nenhum item para comprar</p>
        <p className="text-sm text-muted-foreground/70">Seu estoque está em dia!</p>
      </div>
    );
  }

  const supplierTotals = categories
    .flatMap((c) => c.suppliers)
    .reduce(
      (acc, s) => {
        const prev = acc.get(s.supplier_id);
        if (!prev) {
          acc.set(s.supplier_id, {
            name: s.supplier_name,
            value: s.totalValue,
            units: s.totalUnits,
            items: s.itemCount,
          });
        } else {
          prev.value += s.totalValue;
          prev.units += s.totalUnits;
          prev.items += s.itemCount;
        }
        return acc;
      },
      new Map<string, { name: string; value: number; units: number; items: number }>(),
    );

  const allSuppliers = [...supplierTotals.values()].sort(
    (a, b) => b.value - a.value || b.units - a.units || a.name.localeCompare(b.name, "pt-BR"),
  );

  return (
    <div className="space-y-4">
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 space-y-3">
          <div>
            <p className="text-base font-semibold text-foreground">
              Total geral: {totals.itemCount} item{totals.itemCount !== 1 ? "s" : ""} · {totals.totalUnits} un.
              {totals.totalBoxes > 0 ? ` · ${totals.totalBoxes} cx` : ""}
              {totals.totalValue > 0 ? ` · ${money(totals.totalValue)}` : ""}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totals.categoryCount} categoria{totals.categoryCount !== 1 ? "s" : ""} ·{" "}
              {totals.supplierCount} fornecedor{totals.supplierCount !== 1 ? "es" : ""}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-md border border-border/50 bg-background/60 p-2.5 space-y-1 max-h-40 overflow-y-auto">
              <p className="font-medium text-foreground sticky top-0 bg-background/95">Por categoria</p>
              {categories.map((c) => (
                <div key={c.category_id} className="flex justify-between gap-2 text-muted-foreground">
                  <span className="truncate">{c.category_name}</span>
                  <span className="tabular-nums shrink-0">
                    {c.totalUnits} un.
                    {c.totalValue > 0 ? ` · ${money(c.totalValue)}` : ""}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-md border border-border/50 bg-background/60 p-2.5 space-y-1 max-h-40 overflow-y-auto">
              <p className="font-medium text-foreground sticky top-0 bg-background/95">Por fornecedor</p>
              {allSuppliers.map((s) => (
                <div key={s.name} className="flex justify-between gap-2 text-muted-foreground">
                  <span className="truncate">{s.name}</span>
                  <span className="tabular-nums shrink-0">
                    {s.units} un.
                    {s.value > 0 ? ` · ${money(s.value)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Ordenar por</span>
        {SORT_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            size="sm"
            variant={sortMode === opt.value ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setSortMode(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {categories.map((category, idx) => (
          <CategoryBlock
            key={category.category_id}
            category={category}
            defaultOpen={idx < 3}
            logisticsMap={logisticsMap}
            selectedBySupplier={selectedBySupplier}
            onToggleProduct={toggleProductSelection}
            onGeneratePurchase={onGeneratePurchase}
          />
        ))}
      </div>
    </div>
  );
}
