type ImportReadinessInput = {
  supplierId: string | null | undefined;
  items: Array<{ productId: string | null | undefined }>;
};

export type ImportReadiness = {
  ready: boolean;
  missingSupplier: boolean;
  unboundProductCount: number;
  message: string | null;
};

export function getImportReadiness(input: ImportReadinessInput): ImportReadiness {
  const missingSupplier = !input.supplierId?.trim();
  const unboundProductCount = input.items.filter((item) => !item.productId?.trim()).length;

  if (!missingSupplier && unboundProductCount === 0) {
    return { ready: true, missingSupplier, unboundProductCount, message: null };
  }

  const productsMessage = `Vincule ${unboundProductCount} ${
    unboundProductCount === 1 ? "produto" : "produtos"
  } ainda sem correspondência.`;
  const message = missingSupplier
    ? unboundProductCount > 0
      ? `Selecione o fornecedor e ${productsMessage[0].toLowerCase()}${productsMessage.slice(1)}`
      : "Selecione o fornecedor."
    : productsMessage;

  return { ready: false, missingSupplier, unboundProductCount, message };
}

export function assertImportReady(input: ImportReadinessInput): void {
  const readiness = getImportReadiness(input);
  if (!readiness.ready) throw new Error(readiness.message!);
}
