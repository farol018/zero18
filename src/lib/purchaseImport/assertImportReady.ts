type ImportReadinessInput = {
  supplierId: string | null | undefined;
  items: Array<{ productId: string | null | undefined }>;
};

export type ImportReadiness = {
  ready: boolean;
  missingSupplier: boolean;
  unboundProductCount: number;
  emptyItems: boolean;
  message: string | null;
};

export function getImportReadiness(input: ImportReadinessInput): ImportReadiness {
  const missingSupplier = !input.supplierId?.trim();
  const emptyItems = input.items.length === 0;
  const unboundProductCount = input.items.filter((item) => !item.productId?.trim()).length;

  if (!missingSupplier && !emptyItems && unboundProductCount === 0) {
    return {
      ready: true,
      missingSupplier,
      unboundProductCount,
      emptyItems,
      message: null,
    };
  }

  if (emptyItems) {
    return {
      ready: false,
      missingSupplier,
      unboundProductCount,
      emptyItems: true,
      message: missingSupplier
        ? "Selecione o fornecedor e inclua ao menos um item."
        : "A NFe não possui itens para importar.",
    };
  }

  const productsMessage = `Vincule ${unboundProductCount} ${
    unboundProductCount === 1 ? "produto" : "produtos"
  } ainda sem correspondência.`;
  const message = missingSupplier
    ? unboundProductCount > 0
      ? `Selecione o fornecedor e ${productsMessage[0].toLowerCase()}${productsMessage.slice(1)}`
      : "Selecione o fornecedor."
    : productsMessage;

  return { ready: false, missingSupplier, unboundProductCount, emptyItems, message };
}

export function assertImportReady(input: ImportReadinessInput): void {
  const readiness = getImportReadiness(input);
  if (!readiness.ready) throw new Error(readiness.message!);
}
