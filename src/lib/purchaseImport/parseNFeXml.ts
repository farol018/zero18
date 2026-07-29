import {
  normalizeDigits,
  type PurchaseImportItem,
  type PurchaseImportModel,
} from "./purchaseImportModel";

function text(element: Element | null): string | null {
  const value = element?.textContent?.trim() ?? "";
  return value || null;
}

function firstDescendant(element: ParentNode, localName: string): Element | null {
  return Array.from(element.querySelectorAll("*")).find(
    (candidate) => candidate.localName === localName,
  ) ?? null;
}

function directChild(element: Element, localName: string): Element | null {
  return Array.from(element.children).find((child) => child.localName === localName) ?? null;
}

function childText(element: Element, localName: string): string | null {
  return text(directChild(element, localName));
}

function parseNumber(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: string | null): string | null {
  const match = value?.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function parseNFeKey(value: string | null): string | null {
  const digits = normalizeDigits(value?.replace(/^NFe/i, "") ?? null);
  return digits?.length === 44 ? digits : null;
}

function usableGtin(value: string | null): string | null {
  if (!value || /^SEM\s+GTIN$/i.test(value)) return null;
  return value;
}

function parseItem(det: Element, index: number): PurchaseImportItem | null {
  const product = directChild(det, "prod");
  if (!product) return null;

  return {
    lineKey: det.getAttribute("nItem")?.trim() || String(index + 1),
    codeInternal: null,
    gtin: usableGtin(childText(product, "cEAN")) ?? usableGtin(childText(product, "cEANTrib")),
    supplierProductCode: childText(product, "cProd"),
    sku: null,
    name: childText(product, "xProd"),
    unit: childText(product, "uCom"),
    quantity: parseNumber(childText(product, "qCom")),
    unitCost: parseNumber(childText(product, "vUnCom")),
    totalCost: parseNumber(childText(product, "vProd")),
  };
}

export async function parseNFeXml(input: File | string): Promise<PurchaseImportModel> {
  const xml = typeof input === "string" ? input : await input.text();
  const document = new DOMParser().parseFromString(xml, "application/xml");

  if (document.querySelector("parsererror")) {
    throw new Error("XML inválido. Envie um arquivo XML de NFe válido.");
  }

  const infNFe = firstDescendant(document, "infNFe");
  if (!infNFe) {
    throw new Error("O arquivo XML não contém uma NFe válida.");
  }

  const ide = firstDescendant(infNFe, "ide");
  const emitter = firstDescendant(infNFe, "emit");
  const total = firstDescendant(infNFe, "ICMSTot");
  const items = Array.from(infNFe.children)
    .filter((element) => element.localName === "det")
    .map(parseItem)
    .filter((item): item is PurchaseImportItem => item !== null);

  return {
    source: "xml",
    externalId:
      parseNFeKey(infNFe.getAttribute("Id")) ??
      parseNFeKey(text(firstDescendant(document, "chNFe"))),
    invoiceNumber: ide ? childText(ide, "nNF") : null,
    invoiceSeries: ide ? childText(ide, "serie") : null,
    issuedAt: ide ? dateOnly(childText(ide, "dhEmi")) : null,
    receivedAt: ide
      ? dateOnly(childText(ide, "dhSaiEnt")) ?? dateOnly(childText(ide, "dSaiEnt"))
      : null,
    supplier: {
      document: emitter ? normalizeDigits(childText(emitter, "CNPJ")) : null,
      name: emitter ? childText(emitter, "xNome") : null,
    },
    items,
    totalAmount: total ? parseNumber(childText(total, "vNF")) : null,
  };
}
