import { useState, useMemo } from "react";
import { FarolItem } from "@/hooks/useFarol";
import { EffectiveStatus } from "@/lib/farolCalculations";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusFilter } from "@/pages/Index";
import { InlineMultipleInput } from "./InlineMultipleInput";
import { formatProductLabel, productSku } from "@/lib/formatProduct";

interface FarolFullTableProps {
  items: FarolItem[];
  statusFilter: StatusFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
}

const ITEMS_PER_PAGE = 20;

type SortKey = "product_name" | "estoque_atual" | "consumo_medio_dia" | "dias_estoque";
type SortDir = "asc" | "desc";

const statusConfig: Record<EffectiveStatus, { label: string; symbol: string; color: string; badgeBg: string; badgeText: string }> = {
  ruptura: { label: "Ruptura", symbol: "✕", color: "text-destructive", badgeBg: "bg-destructive/15 border-destructive/30", badgeText: "text-destructive" },
  risco: { label: "Risco", symbol: "✕", color: "text-destructive/80", badgeBg: "bg-destructive/8 border-destructive/20", badgeText: "text-destructive/80" },
  yellow: { label: "Atenção", symbol: "—", color: "text-warning", badgeBg: "bg-warning/10 border-warning/30", badgeText: "text-warning" },
  green: { label: "OK", symbol: "✓", color: "text-success", badgeBg: "bg-success/10 border-success/30", badgeText: "text-success" },
  neutral: { label: "Sem consumo", symbol: "·", color: "text-muted-foreground/60", badgeBg: "bg-muted border-muted-foreground/20", badgeText: "text-muted-foreground" },
  anomaly: { label: "Erro", symbol: "⚠", color: "text-orange-500", badgeBg: "bg-orange-50 border-orange-300", badgeText: "text-orange-600" },
};

function StatusBadge({ status }: { status: EffectiveStatus }) {
  const cfg = statusConfig[status];
  if (status === "anomaly") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}>
        <AlertTriangle className="h-3 w-3" />
        {cfg.label}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}>
      <span className="font-bold text-xs leading-none">{cfg.symbol}</span>
      {cfg.label}
    </span>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return dir === "asc"
    ? <ArrowUp className="inline h-3 w-3 ml-1" />
    : <ArrowDown className="inline h-3 w-3 ml-1" />;
}

export function FarolFullTable({ items, statusFilter, onStatusFilterChange }: FarolFullTableProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "product_name" ? "asc" : "desc");
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "all") {
      result = result.filter((i) => i.effective_status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.product_name?.toLowerCase().includes(q) ||
          i.sku?.toLowerCase().includes(q),
      );
    }
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey] ?? 0;
        const bv = b[sortKey] ?? 0;
        const cmp = typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv, "pt-BR")
          : (av as number) - (bv as number);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [items, statusFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

  const handleFilterChange = (val: string) => {
    onStatusFilterChange(val as StatusFilter || "all");
    setPage(0);
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(0);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-muted-foreground">Todos os produtos</h2>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ToggleGroup
          type="single"
          value={statusFilter}
          onValueChange={handleFilterChange}
          className="justify-start flex-wrap"
        >
          <ToggleGroupItem value="all" size="sm" title="Todos os produtos">Todos</ToggleGroupItem>
          <ToggleGroupItem value="ruptura" size="sm" title="Sem estoque"><span className="font-bold text-destructive">✕</span> Ruptura</ToggleGroupItem>
          <ToggleGroupItem value="risco" size="sm" title="Risco de ruptura"><span className="font-bold text-destructive/80">✕</span> Risco</ToggleGroupItem>
          <ToggleGroupItem value="yellow" size="sm" title="Atenção"><span className="font-bold text-warning">—</span> Atenção</ToggleGroupItem>
          <ToggleGroupItem value="green" size="sm" title="Estoque ok"><span className="font-bold text-success">✓</span> OK</ToggleGroupItem>
          <ToggleGroupItem value="neutral" size="sm" title="Sem consumo"><span className="font-bold text-muted-foreground/60">·</span></ToggleGroupItem>
          <ToggleGroupItem value="anomaly" size="sm" title="Anomalia"><AlertTriangle className="h-3.5 w-3.5 text-orange-500" /></ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full caption-bottom text-[13px]">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <th className="h-8 px-3 text-left align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("product_name")}>
                  Produto<SortIcon active={sortKey === "product_name"} dir={sortDir} />
                </th>
                <th className="h-8 px-3 text-right align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors w-[80px]" onClick={() => handleSort("estoque_atual")}>
                  Estoque<SortIcon active={sortKey === "estoque_atual"} dir={sortDir} />
                </th>
                <th className="h-8 px-3 text-right align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors w-[90px]" onClick={() => handleSort("consumo_medio_dia")}>
                  Cons./dia<SortIcon active={sortKey === "consumo_medio_dia"} dir={sortDir} />
                </th>
                <th className="h-8 px-3 text-right align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors w-[60px]" onClick={() => handleSort("dias_estoque")}>
                  Dias<SortIcon active={sortKey === "dias_estoque"} dir={sortDir} />
                </th>
                <th className="h-8 px-2 text-center align-middle font-medium text-muted-foreground w-[100px]">Status</th>
                <th className="h-8 px-3 text-right align-middle font-medium text-muted-foreground min-w-[160px] w-[160px]">Compra</th>
                <th className="h-8 px-2 text-center align-middle font-medium text-muted-foreground w-[50px]">Múlt.</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item, idx) => {
                const isNeutral = item.effective_status === "neutral";
                const isSelected = selectedId === item.product_id;
                const isEven = idx % 2 === 0;
                return (
                  <tr
                    key={item.product_id}
                    onClick={() => setSelectedId(isSelected ? null : item.product_id)}
                    className={`h-7 border-b border-border/50 cursor-pointer transition-colors hover:bg-accent/60 ${
                      isSelected
                        ? "bg-accent border-l-2 border-l-primary"
                        : isEven
                          ? "bg-card"
                          : "bg-muted/30"
                    } ${isNeutral && !isSelected ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    <td className="py-1 px-3 align-middle font-medium max-w-[320px] truncate" title={formatProductLabel(item)}>
                      {productSku(item) && (
                        <span className="text-muted-foreground font-normal text-[11px] mr-1">{productSku(item)} —</span>
                      )}
                      {item.product_name}
                    </td>
                    <td className="text-right tabular-nums py-1 px-3 align-middle">
                      {Math.round(item.estoque_atual ?? 0)}
                    </td>
                    <td className="text-right tabular-nums py-1 px-3 align-middle">
                      {(item.consumo_medio_dia ?? 0).toFixed(1)}
                    </td>
                    <td className="text-right tabular-nums py-1 px-3 align-middle">
                      {item.dias_estoque != null ? Math.round(item.dias_estoque) : "—"}
                    </td>
                    <td className="text-center py-1 px-2 align-middle">
                      <StatusBadge status={item.effective_status} />
                    </td>
                    <td className="text-right tabular-nums font-medium py-1 px-3 align-middle whitespace-nowrap min-w-[160px]">
                      {(item.sugestao_compra ?? 0) > 0
                        ? (() => {
                            const qty = Math.round(item.sugestao_compra!);
                            const mult = item.purchase_multiple ?? 1;
                            const cost = item.cost_price;
                            const totalCost = cost != null ? qty * cost : null;
                            const formattedCost = totalCost != null
                              ? totalCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                              : "—";
                            if (mult > 1) {
                              const boxes = Math.ceil(qty / mult);
                              return (
                                <span>
                                  <span className="font-bold">{qty}</span>
                                  <span className="text-muted-foreground"> un.</span>
                                  <span className="text-muted-foreground/70 text-[11px] ml-1">| {boxes} cx</span>
                                  <span className="text-muted-foreground/60 text-[11px] ml-1">— {formattedCost}</span>
                                </span>
                              );
                            }
                            return (
                              <span>
                                <span className="font-bold">{qty}</span>
                                <span className="text-muted-foreground"> un.</span>
                                <span className="text-muted-foreground/60 text-[11px] ml-1">— {formattedCost}</span>
                              </span>
                            );
                          })()
                        : "—"}
                    </td>
                    <td className="text-center py-1 px-2 align-middle">
                      <InlineMultipleInput
                        productId={item.product_id!}
                        currentValue={item.purchase_multiple ?? 1}
                        compact
                      />
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {filtered.length} produto{filtered.length !== 1 ? "s" : ""} · Página {currentPage + 1} de {totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

    </section>
  );
}
