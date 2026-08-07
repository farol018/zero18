import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePurchaseOpsKpis } from "@/hooks/usePurchaseOpsKpis";
import {
  averageTicket,
  formatConfirmedVsDraftPct,
  formatSharePct,
  supplierSharePct,
  type PurchaseOpsWindowKpis,
} from "@/lib/purchaseOpsKpis";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function WindowCard({ title, w }: { title: string; w: PurchaseOpsWindowKpis }) {
  const ticket = averageTicket(w.confirmed_amount, w.confirmed_count);
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-xl font-semibold text-foreground">{formatMoney(w.confirmed_amount)}</p>
      <p className="text-sm text-foreground">
        {w.confirmed_count} NF{w.confirmed_count === 1 ? "" : "s"} confirmada{w.confirmed_count === 1 ? "" : "s"}
      </p>
      <p className="text-xs text-muted-foreground">
        Ticket médio {ticket === null ? "—" : formatMoney(ticket)}
      </p>
      <p className="text-xs text-muted-foreground">
        {w.cancelled_count} cancelada{w.cancelled_count === 1 ? "" : "s"}
      </p>
      <p className="text-xs text-muted-foreground">
        Taxa de fechamento {formatConfirmedVsDraftPct(w.confirmed_vs_draft_pct)}
      </p>
    </div>
  );
}

export function GestaoView() {
  const q = usePurchaseOpsKpis();

  if (q.error && !q.data) {
    return (
      <div className="rounded-lg border border-destructive/30 p-6 text-center space-y-3">
        <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
        <p className="text-sm text-foreground">Não foi possível carregar a Gestão.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void q.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!q.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const data = q.data;
  const emptyConfirmed =
    data.windows.d14.confirmed_count === 0 && data.windows.d30.confirmed_count === 0;
  const confirmed30Amount = data.windows.d30.confirmed_amount;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Gestão</h2>
        <p className="text-sm text-muted-foreground">Visão operacional de compras</p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Entradas</h3>
        {emptyConfirmed ? (
          <p className="text-sm text-muted-foreground">Ainda sem compras confirmadas</p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <WindowCard title="Últimos 14 dias" w={data.windows.d14} />
          <WindowCard title="Últimos 30 dias (Acumulado)" w={data.windows.d30} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Drafts abertos</h3>
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-sm text-foreground">
            {data.drafts_open.total} compra{data.drafts_open.total === 1 ? "" : "s"}
          </p>
          <p className="text-xl font-semibold text-foreground">
            {formatMoney(data.drafts_open.total_amount)}
          </p>
          <p className="text-xs text-muted-foreground">
            BLING {data.drafts_open.bling} · Farol {data.drafts_open.farol} · Outros{" "}
            {data.drafts_open.other}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Top fornecedores (30 dias)</h3>
        {data.top_suppliers_d30.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum fornecedor no período</p>
        ) : (
          <ul className="rounded-lg border bg-card divide-y">
            {data.top_suppliers_d30.map((s) => {
              const share = supplierSharePct(s.amount, confirmed30Amount);
              return (
                <li
                  key={s.supplier_id}
                  className="flex items-baseline justify-between gap-3 px-4 py-3"
                >
                  <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                  <span className="text-sm text-foreground shrink-0 text-right">
                    {formatMoney(s.amount)}
                    <span className="text-muted-foreground"> · {formatSharePct(share)}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {s.count} NF{s.count === 1 ? "" : "s"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
