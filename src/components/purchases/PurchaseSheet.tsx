import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  usePurchase,
  usePurchaseMutations,
  useProductsOptions,
  useSuppliersOptions,
  type PurchaseItemInput,
} from "@/hooks/usePurchases";
import {
  SOURCE_LABELS,
  canCancelPurchase,
  canConfirmPurchase,
  canDeletePurchase,
  canEditPurchase,
  type PurchaseSource,
  type PurchaseStatus,
} from "@/lib/purchaseStatus";
import { lineTotal, sumPurchaseTotal } from "@/lib/purchaseTotals";
import { PurchaseStatusBadge } from "@/components/purchases/PurchaseStatusBadge";
import {
  logisticsLabelFor,
  useProductLogisticsMap,
} from "@/hooks/useProductLogistics";
import {
  assertImportReady,
  getImportReadiness,
} from "@/lib/purchaseImport/assertImportReady";
import type { MatchedPurchaseImport } from "@/lib/purchaseImport/matchPurchaseImport";
import type { FarolPurchaseSeed } from "@/lib/purchaseImport/buildFarolPurchaseSeed";
import { toErrorMessage } from "@/lib/toErrorMessage";

type DraftLine = PurchaseItemInput & {
  key: string;
  product_name?: string | null;
  product_sku?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseId: string | null;
  initialImport?: MatchedPurchaseImport | null;
  initialFarolSeed?: FarolPurchaseSeed | null;
};

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function validateDraftLines(
  lines: Array<{ product_id: string; quantity: number; unit_cost: number }>,
): string | null {
  if (lines.length === 0) return "Inclua ao menos um produto.";
  for (const line of lines) {
    if (!line.product_id?.trim()) return "Todas as linhas precisam de um produto.";
    if (!(Number(line.quantity) > 0)) {
      return "Informe quantidade maior que zero em todas as linhas.";
    }
    if (!Number.isFinite(Number(line.unit_cost)) || Number(line.unit_cost) < 0) {
      return "Informe custo unitário válido (zero ou positivo) em todas as linhas.";
    }
  }
  return null;
}

export function PurchaseSheet({
  open,
  onOpenChange,
  purchaseId,
  initialImport = null,
  initialFarolSeed = null,
}: Props) {
  const isNew = purchaseId == null;
  const isXmlImport = isNew && initialImport != null;
  const isFarolImport = isNew && initialFarolSeed != null;
  const detail = usePurchase(isNew ? null : purchaseId);
  const { createDraft, updateDraft, confirmPurchase, cancelPurchase, deleteDraft } =
    usePurchaseMutations();
  const suppliers = useSuppliersOptions();
  const products = useProductsOptions();

  const [supplierId, setSupplierId] = useState("");
  const [issuedAt, setIssuedAt] = useState(todayISODate());
  const [receivedAt, setReceivedAt] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceSeries, setInvoiceSeries] = useState("");
  const [externalId, setExternalId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [unmatchedSearches, setUnmatchedSearches] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const lineProductIds = useMemo(() => lines.map((l) => l.product_id), [lines]);
  const logisticsMap = useProductLogisticsMap(lineProductIds).data;

  const status: PurchaseStatus = isNew
    ? "draft"
    : (detail.data?.purchase.status ?? "draft");
  const source: PurchaseSource = isNew
    ? isXmlImport
      ? "xml"
      : isFarolImport
        ? "farol"
        : "manual"
    : (detail.data?.purchase.source ?? "manual");
  const editable = isNew || canEditPurchase(status);

  useEffect(() => {
    if (!open) return;
    if (isNew) {
      if (initialImport) {
        setSupplierId(initialImport.supplierId ?? "");
        setIssuedAt(initialImport.model.issuedAt ?? todayISODate());
        setReceivedAt(initialImport.model.receivedAt ?? "");
        setInvoiceNumber(initialImport.model.invoiceNumber ?? "");
        setInvoiceSeries(initialImport.model.invoiceSeries ?? "");
        setExternalId(initialImport.model.externalId ?? "");
        setNotes("");
        setLines(
          initialImport.items.map((item) => ({
            key: item.lineKey,
            product_id: item.productId ?? "",
            quantity: item.quantity,
            unit_cost: item.unitCost,
            product_supplier_id: item.productSupplierId,
            product_name: item.productName,
            product_sku: item.productSku,
          })),
        );
        setProductSearch("");
        setUnmatchedSearches({});
        return;
      }
      if (initialFarolSeed) {
        setSupplierId(initialFarolSeed.supplierId);
        setIssuedAt(initialFarolSeed.issuedAt);
        setReceivedAt("");
        setInvoiceNumber("");
        setInvoiceSeries("");
        setExternalId("");
        setNotes("");
        setLines(
          initialFarolSeed.items.map((item) => ({
            key: crypto.randomUUID(),
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            product_supplier_id: null,
            product_name: item.productName,
            product_sku: item.productSku,
          })),
        );
        setProductSearch("");
        setUnmatchedSearches({});
        return;
      }
      setSupplierId("");
      setIssuedAt(todayISODate());
      setReceivedAt("");
      setInvoiceNumber("");
      setInvoiceSeries("");
      setExternalId("");
      setNotes("");
      setLines([]);
      setProductSearch("");
      setUnmatchedSearches({});
      return;
    }
    if (!detail.data) return;
    const { purchase, items } = detail.data;
    setSupplierId(purchase.supplier_id);
    setIssuedAt(purchase.issued_at);
    setReceivedAt(purchase.received_at ?? "");
    setInvoiceNumber(purchase.invoice_number ?? "");
    setInvoiceSeries(purchase.invoice_series ?? "");
    setExternalId(purchase.external_id ?? "");
    setNotes(purchase.notes ?? "");
    setLines(
      items.map((item) => ({
        key: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        product_supplier_id: item.product_supplier_id,
      })),
    );
  }, [open, isNew, detail.data, initialImport, initialFarolSeed]);

  const total = useMemo(() => sumPurchaseTotal(lines), [lines]);
  const importReadiness = useMemo(
    () => getImportReadiness({ supplierId, items: lines.map((line) => ({ productId: line.product_id })) }),
    [lines, supplierId],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = products.data ?? [];
    if (!q) return list.slice(0, 40);
    return list
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [products.data, productSearch]);

  const lineLabel = (line: DraftLine) => {
    if (!line.product_id) return "Produto não localizado";
    const fromOptions = products.data?.find((p) => p.id === line.product_id);
    if (fromOptions) {
      return fromOptions.sku ? `${fromOptions.name} · ${fromOptions.sku}` : fromOptions.name;
    }
    if (line.product_name) {
      return line.product_sku ? `${line.product_name} · ${line.product_sku}` : line.product_name;
    }
    const fromDetail = detail.data?.items.find((i) => i.product_id === line.product_id);
    if (fromDetail?.product_name) return fromDetail.product_name;
    return "Produto";
  };

  const addProduct = (productId: string) => {
    if (!editable) return;
    const product = products.data?.find((p) => p.id === productId);
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        product_id: productId,
        quantity: 1,
        unit_cost: Number(product?.cost_price ?? 0),
        product_supplier_id: null,
        product_name: product?.name ?? null,
        product_sku: product?.sku ?? null,
      },
    ]);
    setProductSearch("");
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  };

  const unmatchedProducts = (key: string) => {
    const q = (unmatchedSearches[key] ?? "").trim().toLowerCase();
    if (!q) return [];
    return (products.data ?? [])
      .filter(
        (product) =>
          product.name.toLowerCase().includes(q) || (product.sku ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  };

  const payload = () => ({
    supplier_id: supplierId,
    issued_at: issuedAt,
    received_at: receivedAt || null,
    invoice_number: invoiceNumber,
    invoice_series: invoiceSeries,
    notes,
    items: lines.map(({ product_id, quantity, unit_cost, product_supplier_id }) => ({
      product_id,
      quantity,
      unit_cost,
      product_supplier_id: product_supplier_id ?? null,
    })),
  });

  const handleSave = async () => {
    const lineError = validateDraftLines(lines);
    if (lineError) {
      toast.error(lineError);
      return;
    }
    try {
      if (isNew) {
        const id = await createDraft.mutateAsync({
          ...payload(),
          source: initialFarolSeed ? "farol" : "manual",
        });
        toast.success("Compra criada em rascunho.");
        onOpenChange(false);
        return id;
      }
      await updateDraft.mutateAsync({ id: purchaseId!, ...payload() });
      toast.success("Compra atualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar compra.");
    }
  };

  const handleImportConfirm = async () => {
    try {
      assertImportReady({
        supplierId,
        items: lines.map((line) => ({ productId: line.product_id })),
      });
      const lineError = validateDraftLines(lines);
      if (lineError) {
        toast.error(lineError);
        return;
      }      await createDraft.mutateAsync({
        ...payload(),
        source: "xml",
        external_id: externalId,
        items: lines
          .filter((line): line is DraftLine & { product_id: string } => Boolean(line.product_id.trim()))
          .map(({ product_id, quantity, unit_cost, product_supplier_id }) => ({
            product_id,
            quantity,
            unit_cost,
            product_supplier_id: product_supplier_id ?? null,
          })),
      });
      toast.success("NFe importada em rascunho.");
      onOpenChange(false);
    } catch (e) {
      console.error("[import NFe]", e);
      toast.error(toErrorMessage(e, "Erro ao importar NFe."));
    }
  };

  const handleConfirm = async () => {
    if (confirmBusy) return;
    if (isNew || editable) {
      const lineError = validateDraftLines(lines);
      if (lineError) {
        toast.error(lineError);
        return;
      }
    }
    setConfirmBusy(true);
    try {
      if (isNew || editable) {
        if (isNew) {
          const id = await createDraft.mutateAsync({
            ...payload(),
            source: initialFarolSeed ? "farol" : "manual",
          });
          await confirmPurchase.mutateAsync(id);
        } else {
          await updateDraft.mutateAsync({ id: purchaseId!, ...payload() });
          await confirmPurchase.mutateAsync(purchaseId!);
        }
      } else {
        await confirmPurchase.mutateAsync(purchaseId!);
      }
      toast.success("Compra confirmada.");
      setConfirmOpen(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar.");
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelPurchase.mutateAsync(purchaseId!);
      toast.success("Compra cancelada.");
      setCancelOpen(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cancelar.");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDraft.mutateAsync(purchaseId!);
      toast.success("Rascunho excluído.");
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{isNew ? "Nova compra" : "Compra"}</SheetTitle>
            <SheetDescription>
              Fundação do módulo de compras. Confirmado é imutável.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <PurchaseStatusBadge status={status} />
              <span className="text-xs text-muted-foreground">
                Origem: <strong className="text-foreground">{SOURCE_LABELS[source]}</strong>
              </span>
            </div>

            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={!editable || isFarolImport}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {isXmlImport &&
                  initialImport?.supplierId &&
                  !(suppliers.data ?? []).some((s) => s.id === initialImport.supplierId) && (
                    <option value={initialImport.supplierId}>
                      {initialImport.model.supplier.name ??
                        initialImport.model.supplier.document ??
                        "Fornecedor da NFe"}
                    </option>
                  )}
                {isFarolImport &&
                  initialFarolSeed?.supplierId &&
                  !(suppliers.data ?? []).some((s) => s.id === initialFarolSeed.supplierId) && (
                    <option value={initialFarolSeed.supplierId}>
                      {initialFarolSeed.supplierName}
                    </option>
                  )}
                {(suppliers.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Emitida em</Label>
                <Input
                  type="date"
                  disabled={!editable}
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Recebida em</Label>
                <Input
                  type="date"
                  disabled={!editable}
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nota fiscal</Label>
              <Input
                disabled={!editable || isXmlImport}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Número da NF"
              />
            </div>
            {isXmlImport && (
              <>
                <div className="space-y-2">
                  <Label>Série</Label>
                  <Input disabled value={invoiceSeries} />
                </div>
                <div className="space-y-2">
                  <Label>Chave de acesso NFe</Label>
                  <Input disabled value={externalId} className="font-mono text-xs" />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                disabled={!editable}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Itens</Label>
                <span className="text-sm font-medium">{money(total)}</span>
              </div>

              {editable && (
                <div className="space-y-2 rounded-md border border-border p-2">
                  <Input
                    placeholder="Buscar produto por nome ou SKU…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  {productSearch.trim() && (
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
                          onClick={() => addProduct(p.id)}
                        >
                          <Plus className="inline h-3 w-3 mr-1" />
                          {p.name}
                          {p.sku ? ` · ${p.sku}` : ""}
                        </button>
                      ))}
                      {filteredProducts.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-1">Nenhum produto.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                {lines.map((line) => (
                  <div
                    key={line.key}
                    className="rounded-md border border-border/60 p-2 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">
                        {lineLabel(line)}
                      </p>
                      {editable && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={() => removeLine(line.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {!line.product_id && editable && (
                      <div className="space-y-1 rounded border border-amber-500/40 bg-amber-500/5 p-2">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          Produto não localizado. Busque e vincule um produto do catálogo.
                        </p>
                        <Input
                          placeholder="Buscar produto por nome ou SKU…"
                          value={unmatchedSearches[line.key] ?? ""}
                          onChange={(event) =>
                            setUnmatchedSearches((prev) => ({
                              ...prev,
                              [line.key]: event.target.value,
                            }))
                          }
                        />
                        {unmatchedProducts(line.key).map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            className="block w-full rounded px-1 py-1 text-left text-xs hover:bg-muted"
                            onClick={() => {
                              updateLine(line.key, {
                                product_id: product.id,
                                product_name: product.name,
                                product_sku: product.sku,
                              });
                              setUnmatchedSearches((prev) => ({ ...prev, [line.key]: "" }));
                            }}
                          >
                            {product.name}
                            {product.sku ? ` · ${product.sku}` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[11px]">Qtd</Label>
                        <Input
                          type="number"
                          min={0.01}
                          step="any"
                          disabled={!editable}
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.key, { quantity: Number(e.target.value) || 0 })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">Custo un.</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          disabled={!editable}
                          value={line.unit_cost}
                          onChange={(e) =>
                            updateLine(line.key, { unit_cost: Number(e.target.value) || 0 })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">Total</Label>
                        <Input
                          disabled
                          value={money(lineTotal(line.quantity, line.unit_cost))}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Sugestão logística:{" "}
                      <span className="text-foreground">
                        {logisticsLabelFor(line.quantity, logisticsMap?.get(line.product_id))}
                      </span>
                    </p>
                  </div>
                ))}
                {lines.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum item nesta compra.</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {isXmlImport ? (
                <>
                  <Button
                    type="button"
                    disabled={!importReadiness.ready || createDraft.isPending}
                    onClick={() => void handleImportConfirm()}
                  >
                    Criar rascunho para revisão
                  </Button>
                  {!importReadiness.ready && (
                    <p className="w-full text-xs text-destructive">{importReadiness.message}</p>
                  )}
                </>
              ) : editable && (
                <Button type="button" onClick={() => void handleSave()}>
                  Salvar rascunho
                </Button>
              )}
              {!isXmlImport && (isNew || canConfirmPurchase(status)) && (
                <Button
                  type="button"
                  variant="default"
                  disabled={confirmBusy}
                  onClick={() => setConfirmOpen(true)}
                >
                  Confirmar compra
                </Button>
              )}
              {!isNew && canCancelPurchase(status) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={cancelPurchase.isPending}
                  onClick={() => setCancelOpen(true)}
                >
                  Cancelar compra
                </Button>
              )}
              {!isNew && canDeletePurchase(status) && (
                <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
                  Excluir
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={(v) => !confirmBusy && setConfirmOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar compra</AlertDialogTitle>
            <AlertDialogDescription>
              Após confirmar, esta compra não poderá mais ser editada. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={confirmBusy} onClick={() => void handleConfirm()}>
              {confirmBusy ? "Confirmando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar compra</AlertDialogTitle>
            <AlertDialogDescription>
              As entradas de estoque desta compra serão removidas. Esta ação não pode ser desfeita
              facilmente. Deseja cancelar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelPurchase.isPending}
              onClick={() => void handleCancel()}
            >
              Cancelar compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rascunho</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove a compra permanentemente. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
