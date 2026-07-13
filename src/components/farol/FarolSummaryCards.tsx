import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { StatusFilter } from "@/pages/Index";

interface FarolSummaryCardsProps {
  rupturaCount: number;
  riscoCount: number;
  yellowCount: number;
  greenCount: number;
  neutralCount: number;
  anomalyCount: number;
  activeFilter: StatusFilter;
  onFilterClick: (status: StatusFilter) => void;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "anomaly") {
    return (
      <div className="flex items-center justify-center h-7 w-7 shrink-0 rounded-full bg-orange-100 border border-orange-300">
        <AlertTriangle className="h-3 w-3 text-orange-600" />
      </div>
    );
  }
  const config: Record<string, { symbol: string; bg: string; border: string; text: string }> = {
    ruptura: { symbol: "✕", bg: "bg-destructive/15", border: "border-destructive/40", text: "text-destructive" },
    risco: { symbol: "✕", bg: "bg-destructive/8", border: "border-destructive/25", text: "text-destructive/80" },
    yellow: { symbol: "—", bg: "bg-warning/10", border: "border-warning/30", text: "text-warning" },
    green: { symbol: "✓", bg: "bg-success/10", border: "border-success/30", text: "text-success" },
    neutral: { symbol: "·", bg: "bg-muted", border: "border-muted-foreground/20", text: "text-muted-foreground" },
  };
  const c = config[status] ?? config.neutral;
  return (
    <div className={`flex items-center justify-center h-7 w-7 shrink-0 rounded-full border ${c.bg} ${c.border}`}>
      <span className={`font-bold text-xs leading-none ${c.text}`}>{c.symbol}</span>
    </div>
  );
}

const summaryConfig = [
  { key: "ruptura" as StatusFilter, label: "sem estoque", ringClass: "ring-destructive/40" },
  { key: "risco" as StatusFilter, label: "risco", ringClass: "ring-destructive/30" },
  { key: "yellow" as StatusFilter, label: "atenção", ringClass: "ring-warning/40" },
  { key: "green" as StatusFilter, label: "estoque ok", ringClass: "ring-success/40" },
  { key: "neutral" as StatusFilter, label: "sem consumo", ringClass: "ring-muted-foreground/40" },
  { key: "anomaly" as StatusFilter, label: "anomalia", ringClass: "ring-orange-400/40" },
];

export function FarolSummaryCards({
  rupturaCount,
  riscoCount,
  yellowCount,
  greenCount,
  neutralCount,
  anomalyCount,
  activeFilter,
  onFilterClick,
}: FarolSummaryCardsProps) {
  const counts: Record<string, number> = {
    ruptura: rupturaCount,
    risco: riscoCount,
    yellow: yellowCount,
    green: greenCount,
    neutral: neutralCount,
    anomaly: anomalyCount,
  };

  const visibleConfigs = summaryConfig.filter(
    (cfg) => ["ruptura", "risco", "yellow", "green"].includes(cfg.key) || counts[cfg.key] > 0
  );

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
      {visibleConfigs.map((cfg) => {
        const isActive = activeFilter === cfg.key;
        return (
          <Card
            key={cfg.key}
            onClick={() => onFilterClick(cfg.key as StatusFilter)}
            className={`cursor-pointer border-border/50 shadow-none transition-all hover:shadow-sm ${
              isActive ? `ring-2 ${cfg.ringClass}` : ""
            }`}
          >
            <CardContent className="px-3 py-2.5 flex items-center gap-2.5">
              <StatusIcon status={cfg.key} />
              <div>
                <p className="text-lg font-bold text-foreground leading-none">{counts[cfg.key]}</p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{cfg.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
