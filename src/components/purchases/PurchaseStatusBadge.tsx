import { Badge } from "@/components/ui/badge";
import { statusBadgeMeta, type PurchaseStatus } from "@/lib/purchaseStatus";

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const meta = statusBadgeMeta(status);
  return (
    <Badge variant="outline" className={`text-[11px] ${meta.className}`}>
      {meta.label}
    </Badge>
  );
}
