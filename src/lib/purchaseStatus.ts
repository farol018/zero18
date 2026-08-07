export type PurchaseStatus = "draft" | "confirmed" | "cancelled";
export type PurchaseSource = "manual" | "xml" | "csv" | "bling" | "farol";

export const SOURCE_LABELS: Record<PurchaseSource, string> = {
  manual: "Manual",
  xml: "XML",
  csv: "CSV",
  bling: "BLING",
  farol: "Farol",
};

export function canEditPurchase(status: PurchaseStatus): boolean {
  return status === "draft";
}

export function canDeletePurchase(status: PurchaseStatus): boolean {
  return status === "draft";
}

export function canConfirmPurchase(status: PurchaseStatus): boolean {
  return status === "draft";
}

export function canCancelPurchase(status: PurchaseStatus): boolean {
  return status === "confirmed";
}

export function statusBadgeMeta(status: PurchaseStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "draft":
      return {
        label: "🟡 Rascunho",
        className: "bg-warning/10 text-warning border-warning/20",
      };
    case "confirmed":
      return {
        label: "🟢 Confirmado",
        className: "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400",
      };
    case "cancelled":
      return {
        label: "🔴 Cancelado",
        className: "bg-destructive/10 text-destructive border-destructive/20",
      };
  }
}
