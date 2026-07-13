import type { FarolItem } from "@/hooks/useFarol";

type ProductLabel = Pick<FarolItem, "sku" | "product_name">;

export function productSku(item: ProductLabel): string | null {
  const sku = item.sku?.trim();
  return sku || null;
}

export function formatProductLabel(item: ProductLabel): string {
  const sku = productSku(item);
  const name = item.product_name ?? "";
  return sku ? `${sku} — ${name}` : name;
}
