import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Package } from "lucide-react";
import { usePurchasesList, type Purchase } from "@/hooks/usePurchases";
import type { PurchaseStatus } from "@/lib/purchaseStatus";
import { PurchaseStatusBadge } from "@/components/purchases/PurchaseStatusBadge";
import { PurchaseSheet } from "@/components/purchases/PurchaseSheet";
import { RegisterPurchaseDialog } from "@/components/purchases/RegisterPurchaseDialog";
import type { MatchedPurchaseImport } from "@/lib/purchaseImport/matchPurchaseImport";

const FILTERS: Array<{ value: PurchaseStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function PurchasesView() {
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | "all">("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [initialImport, setInitialImport] = useState<MatchedPurchaseImport | null>(null);
  const list = usePurchasesList(statusFilter);

  const openNew = () => {
    setSelectedId(null);
    setInitialImport(null);
    setSheetOpen(true);
  };

  const openPurchase = (purchase: Purchase) => {
    setSelectedId(purchase.id);
    setInitialImport(null);
    setSheetOpen(true);
  };

  const openXmlReview = (matched: MatchedPurchaseImport) => {
    setSelectedId(null);
    setInitialImport(matched);
    setSheetOpen(true);
  };

  const handleSheetOpenChange = (open: boolean) => {
    setSheetOpen(open);
    if (!open) setInitialImport(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Compras</h1>
          <p className="text-sm text-muted-foreground">
            Registre compras manualmente ou importe NFe em XML para revisão.
          </p>
        </div>
        <Button type="button" className="gap-1.5" onClick={() => setRegisterOpen(true)}>
          <Plus className="h-4 w-4" />
          Registrar Compra
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Status</span>
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={statusFilter === f.value ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : list.error ? (
        <p className="text-sm text-destructive">
          Erro ao carregar compras. Confirme se a migration FEATURE 009 foi aplicada.
        </p>
      ) : (list.data ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-2 border border-dashed rounded-lg">
          <Package className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Nenhuma compra registrada</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setRegisterOpen(true)}>
            Registrar primeira compra
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {(list.data ?? []).map((purchase) => (
            <button
              key={purchase.id}
              type="button"
              onClick={() => openPurchase(purchase)}
              className="w-full text-left rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PurchaseStatusBadge status={purchase.status} />
                    <span className="text-sm font-medium truncate">
                      {purchase.supplier_name}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(purchase.issued_at)}
                    {purchase.invoice_number ? ` · NF ${purchase.invoice_number}` : ""}
                    {` · ${purchase.item_count ?? 0} item(ns)`}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {money(purchase.total_amount)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <PurchaseSheet
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        purchaseId={selectedId}
        initialImport={initialImport}
      />
      <RegisterPurchaseDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onManual={openNew}
        onXmlReady={openXmlReview}
      />
    </div>
  );
}
