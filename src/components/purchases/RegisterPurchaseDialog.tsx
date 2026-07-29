import { useRef, useState, type DragEvent } from "react";
import { FileUp, FileText, PenLine } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { findExistingPurchaseByNFeKey } from "@/lib/purchaseImport/checkDuplicateNFe";
import {
  matchPurchaseImport,
  type MatchedPurchaseImport,
} from "@/lib/purchaseImport/matchPurchaseImport";
import { parseNFeXml } from "@/lib/purchaseImport/parseNFeXml";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManual: () => void;
  onXmlReady: (matched: MatchedPurchaseImport) => void;
};

export function RegisterPurchaseDialog({
  open,
  onOpenChange,
  onManual,
  onXmlReady,
}: Props) {
  const { companyId } = useCompany();
  const fileInput = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".xml")) {
      toast.error("Selecione um arquivo XML de NFe.");
      return;
    }
    if (!companyId) {
      toast.error("Empresa não resolvida.");
      return;
    }

    setIsImporting(true);
    try {
      const model = await parseNFeXml(file);
      if (!model.externalId) {
        toast.error("Não foi possível identificar a chave de acesso desta NFe.");
        return;
      }

      const existing = await findExistingPurchaseByNFeKey(companyId, model.externalId);
      if (existing) {
        toast.error("Esta NFe já foi importada.");
        return;
      }

      const [suppliersResult, productsResult, productSuppliersResult] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id, document, name")
          .eq("company_id", companyId),
        supabase
          .from("products")
          .select("id, external_id, gtin, sku, name")
          .eq("company_id", companyId),
        supabase
          .from("product_suppliers")
          .select("product_id, supplier_id, supplier_sku")
          .eq("company_id", companyId),
      ]);
      if (suppliersResult.error) throw suppliersResult.error;
      if (productsResult.error) throw productsResult.error;
      if (productSuppliersResult.error) throw productSuppliersResult.error;

      onXmlReady(
        matchPurchaseImport(model, {
          suppliers: suppliersResult.data ?? [],
          products: productsResult.data ?? [],
          productSuppliers: productSuppliersResult.data ?? [],
        }),
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o XML.");
    } finally {
      setIsImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void importFile(event.dataTransfer.files.item(0) ?? undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Compra</DialogTitle>
          <DialogDescription>Importe uma NFe em XML ou cadastre a compra manualmente.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-28 flex-col items-start gap-2 whitespace-normal p-4 text-left"
            onClick={() => {
              onManual();
              onOpenChange(false);
            }}
          >
            <PenLine className="h-5 w-5" />
            <span className="font-semibold">Cadastro Manual</span>
            <span className="text-xs font-normal text-muted-foreground">
              Informe fornecedor, itens e valores.
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`h-auto min-h-28 flex-col items-start gap-2 whitespace-normal p-4 text-left ${
              isDragging ? "border-primary bg-primary/5" : ""
            }`}
            disabled={isImporting}
            onClick={() => fileInput.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <FileUp className="h-5 w-5" />
            <span className="font-semibold">{isImporting ? "Lendo XML…" : "Importar XML"}</span>
            <span className="text-xs font-normal text-muted-foreground">
              Arraste uma NFe ou selecione o arquivo.
            </span>
          </Button>
        </div>

        <input
          ref={fileInput}
          className="hidden"
          type="file"
          accept=".xml,text/xml,application/xml"
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" /> A chave da NFe é verificada antes da revisão.
        </p>
      </DialogContent>
    </Dialog>
  );
}
