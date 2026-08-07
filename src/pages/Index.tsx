import { useState } from "react";
import { EffectiveStatus } from "@/lib/farolCalculations";
import { useFarol, type ViewMode as FarolViewMode } from "@/hooks/useFarol";
import { useCompany } from "@/contexts/CompanyContext";
import { SupplierOrderView } from "@/components/farol/SupplierOrderView";
import { FarolFullTable } from "@/components/farol/FarolFullTable";
import { FarolSummaryCards } from "@/components/farol/FarolSummaryCards";
import { PurchasesView } from "@/components/purchases/PurchasesView";
import { GestaoView } from "@/components/gestao/GestaoView";
import { usePurchaseOpsKpis } from "@/hooks/usePurchaseOpsKpis";
import type { FarolPurchaseSeed } from "@/lib/purchaseImport/buildFarolPurchaseSeed";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ShoppingCart, BarChart3, RefreshCw, Package, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import farolLogo from "@/assets/farol-logo.png";

export type StatusFilter = "all" | EffectiveStatus;

type ViewMode = "pedido" | "analise" | "compras" | "gestao";

const Index = () => {
  const [mode, setMode] = useState<ViewMode>("pedido");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [farolSeed, setFarolSeed] = useState<FarolPurchaseSeed | null>(null);

  const {
    companyId,
    companyName,
    lastSyncAt,
    refreshCompany,
    isLoading: companyLoading,
    coverageDays,
    error: companyError,
  } = useCompany();

  const farolMode: FarolViewMode = mode === "analise" ? "analise" : "pedido";
  const farolQuery = useFarol(farolMode);
  const kpisQuery = usePurchaseOpsKpis({ enabled: mode === "gestao" });

  const isFarolMode = mode === "pedido" || mode === "analise";
  const isLoading = companyLoading || (isFarolMode && farolQuery.isLoading && !farolQuery.data);
  const error = isFarolMode ? farolQuery.error : null;
  const data = farolQuery.data;

  if (companyLoading) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (companyError || !companyId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-lg space-y-3 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-lg font-medium text-foreground">Acesso à empresa indisponível</p>
          <p className="text-sm text-muted-foreground break-words">
            {companyError ??
              "Não foi possível resolver a empresa da sua conta. Faça login novamente ou contate o administrador."}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const { supabase } = await import("@/integrations/supabase/client");
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
          >
            Sair e tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  if (error && isFarolMode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle className="h-6 w-6" />
          <p className="text-lg">Erro ao carregar dados.</p>
        </div>
      </div>
    );
  }

  const syncLabel = lastSyncAt
    ? `Atualizado ${formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: ptBR })}`
    : "Aguardando primeira sincronização BLING";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={farolLogo} alt="FAROL" className="h-10" />
              <div>
                <p className="text-sm font-medium text-foreground leading-tight">
                  {companyName ?? "FAROL"} — Inteligência que protege seu estoque
                </p>
                <p className="text-xs text-muted-foreground">
                  Decisões automáticas para evitar ruptura e excesso de estoque
                </p>
              </div>
            </div>
            {(isFarolMode || mode === "gestao") && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => {
                  if (mode === "gestao") void kpisQuery.refetch();
                  else void farolQuery.refetch();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar
              </Button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
            <span>{syncLabel}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void refreshCompany()}
            >
              Verificar sync
            </Button>
          </div>

          <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit flex-wrap">
            <button
              onClick={() => setMode("pedido")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "pedido"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              Pedido
            </button>
            <button
              onClick={() => setMode("analise")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "analise"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Análise
            </button>
            <button
              onClick={() => setMode("compras")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "compras"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Package className="h-4 w-4" />
              Compras
            </button>
            <button
              onClick={() => setMode("gestao")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "gestao"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              Gestão
            </button>
          </div>
        </div>

        {mode === "compras" ? (
          <PurchasesView
            pendingFarolSeed={farolSeed}
            onFarolSeedConsumed={() => setFarolSeed(null)}
          />
        ) : mode === "gestao" ? (
          <GestaoView />
        ) : isLoading || !data ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Carregando {companyName ?? "catálogo"}…
            </p>
          </div>
        ) : !data.hasData ? (
          <div className="rounded-lg border border-dashed p-10 text-center space-y-2">
            <p className="text-lg font-medium">Nenhum dado ainda</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Importe os workflows n8n (Produtos → Estoque → Vendas) para carregar o catálogo BLING.
            </p>
          </div>
        ) : (
          <>
            <FarolSummaryCards
              rupturaCount={data.summary.ruptura}
              riscoCount={data.summary.risco}
              yellowCount={data.summary.yellow}
              greenCount={data.summary.green}
              neutralCount={data.summary.neutral}
              anomalyCount={data.summary.anomaly}
              activeFilter={statusFilter}
              onFilterClick={(filter) => {
                setStatusFilter(filter);
                if (mode !== "analise") setMode("analise");
              }}
            />

            {mode === "pedido" ? (
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                  Pedido de compra sugerido
                </h1>
                <p className="text-sm text-muted-foreground">
                  Com base no consumo recente, repor os itens abaixo para manter {coverageDays} dias de
                  cobertura.
                </p>
                <div className="pt-2">
                  <SupplierOrderView
                    groups={data.purchaseGroups}
                    onGeneratePurchase={(seed) => {
                      setFarolSeed(seed);
                      setMode("compras");
                    }}
                  />
                </div>
              </div>
            ) : (
              <FarolFullTable
                items={data.items}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
