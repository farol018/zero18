import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface FarolHeaderProps {
  rupturaCount: number;
  riscoCount: number;
  yellowCount: number;
}

export function FarolHeader({ rupturaCount, riscoCount, yellowCount }: FarolHeaderProps) {
  const criticalCount = rupturaCount + riscoCount;
  const hasRisk = criticalCount > 0 || yellowCount > 0;

  if (!hasRisk) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
        <div>
          <h2 className="text-base font-semibold text-foreground leading-tight">Seu estoque está sob controle</h2>
          <p className="text-xs text-muted-foreground">Nenhum produto precisa de reposição no momento</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {rupturaCount > 0 && (
          <p className="text-sm font-semibold text-destructive">
            {rupturaCount} produto{rupturaCount !== 1 ? "s" : ""} sem estoque
          </p>
        )}
        {riscoCount > 0 && (
          <p className="text-sm font-medium text-destructive/80">
            {riscoCount} produto{riscoCount !== 1 ? "s" : ""} em risco de ruptura
          </p>
        )}
        {yellowCount > 0 && (
          <p className="text-sm text-warning">
            {yellowCount} produto{yellowCount !== 1 ? "s" : ""} precisam de atenção
          </p>
        )}
      </div>
    </div>
  );
}
