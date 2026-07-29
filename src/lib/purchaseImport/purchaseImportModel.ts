export type PurchaseImportSource = "xml";

export type PurchaseImportItem = {
  lineKey: string;
  codeInternal: string | null;
  gtin: string | null;
  supplierProductCode: string | null;
  sku: string | null;
  name: string | null;
  unit: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

export type PurchaseImportModel = {
  source: PurchaseImportSource;
  externalId: string | null;
  invoiceNumber: string | null;
  invoiceSeries: string | null;
  issuedAt: string | null;
  receivedAt: string | null;
  supplier: {
    document: string | null;
    name: string | null;
  };
  items: PurchaseImportItem[];
  totalAmount: number | null;
  rawMeta?: Record<string, unknown>;
};

export function normalizeDigits(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return normalized || null;
}

export function normalizeName(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR") ?? "";
  return normalized || null;
}
