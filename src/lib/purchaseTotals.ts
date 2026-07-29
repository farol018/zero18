export function lineTotal(quantity: number, unitCost: number): number {
  const q = Number(quantity);
  const c = Number(unitCost);
  if (!Number.isFinite(q) || !Number.isFinite(c)) return 0;
  return Math.round(q * c * 100) / 100;
}

export function sumPurchaseTotal(
  items: Array<{ quantity: number; unit_cost: number }>,
): number {
  const sum = items.reduce((acc, item) => acc + lineTotal(item.quantity, item.unit_cost), 0);
  return Math.round(sum * 100) / 100;
}
