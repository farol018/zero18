# FEATURE 011 — Registro de Compras via XML (NFe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir Registrar Compra via Manual ou XML NFe, reutilizando o `PurchaseSheet`/`createDraft` existentes, com pipeline `parse → PurchaseImportModel → match → review → draft`.

**Architecture:** Libs puras em `src/lib/purchaseImport/*`; UI chooser + dropzone; `PurchaseSheet` recebe `initialImport`; `createDraft` aceita `source`/`external_id`/`invoice_series`. Sem segundo fluxo de compras. Spec: `docs/superpowers/specs/2026-07-29-feature-011-purchase-xml-import-design.md`.

**Tech Stack:** React + Vite + TanStack Query + Supabase; `DOMParser` no browser; Vitest.

## Global Constraints

- Não alterar Motor Farol, Pedido, Lista, Logistics, ComposeLogistics, views, cálculos.
- Não criar entidades de import job; não integração BLING/n8n nesta feature.
- `external_id` = somente chave NFe (44 dígitos); `invoice_number` = número; `invoice_series` = série.
- Unicidade da NFe = `(company_id, source, external_id)` — checar **após parse, antes da revisão**.
- Parser aceita `File | string`.
- Matching por nome: se >1 candidato, sem auto-vínculo.
- Campo do cProd no model: `supplierProductCode` (não `supplierSku`).
- Confirmar importação exige fornecedor + todos os produtos vinculados; status inicial `draft`.
- Número/série/chave read-only na revisão XML.
- Commits só se o usuário pedir explicitamente (não incluir push).

---

## File map

| Path | Responsabilidade |
|------|------------------|
| `supabase/migrations/20260729200000_feature_011_purchase_xml_import.sql` | Colunas `invoice_series`, `suppliers.document`, `products.gtin` + índices |
| `src/integrations/supabase/types.ts` | Types das novas colunas |
| `src/lib/purchaseImport/purchaseImportModel.ts` | Tipos do model + helpers de normalização |
| `src/lib/purchaseImport/parseNFeXml.ts` | Parser NFe (`File \| string`) → model |
| `src/lib/purchaseImport/matchPurchaseImport.ts` | Matching + `matchCriteria` |
| `src/lib/purchaseImport/checkDuplicateNFe.ts` | Query dedupe por chave |
| `src/hooks/usePurchases.ts` | `PurchaseDraftInput` + `createDraft` + selects com novas colunas |
| `src/components/purchases/RegisterPurchaseDialog.tsx` | Chooser Manual vs XML + dropzone |
| `src/components/purchases/PurchasesView.tsx` | “Registrar Compra” + wiring |
| `src/components/purchases/PurchaseSheet.tsx` | `initialImport`, read-only NFe, gates, CTA |
| `src/test/parseNFeXml.test.ts` | Parser |
| `src/test/matchPurchaseImport.test.ts` | Matching |
| `src/test/purchaseImportGates.test.ts` | Gates / dedupe helper |

---

### Task 1: Migration + types

**Files:**
- Create: `supabase/migrations/20260729200000_feature_011_purchase_xml_import.sql`
- Modify: `src/integrations/supabase/types.ts` (`purchases`, `suppliers`, `products`)

**Interfaces:**
- Produces: colunas `purchases.invoice_series`, `suppliers.document`, `products.gtin`

- [ ] **Step 1: Criar migration**

```sql
-- FEATURE 011: colunas para importação XML / futuro BLING
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS invoice_series text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS document text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gtin text;

CREATE INDEX IF NOT EXISTS suppliers_company_document_idx
  ON public.suppliers (company_id, document)
  WHERE document IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_company_gtin_idx
  ON public.products (company_id, gtin)
  WHERE gtin IS NOT NULL;
```

- [ ] **Step 2: Atualizar `types.ts`**

Em `purchases.Row|Insert|Update` adicionar `invoice_series: string | null`.  
Em `suppliers.*` adicionar `document: string | null`.  
Em `products.*` adicionar `gtin: string | null`.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`  
Expected: OK (ou só erros pré-existentes não relacionados).

---

### Task 2: PurchaseImportModel + parseNFeXml (TDD)

**Files:**
- Create: `src/lib/purchaseImport/purchaseImportModel.ts`
- Create: `src/lib/purchaseImport/parseNFeXml.ts`
- Create: `src/test/parseNFeXml.test.ts`

**Interfaces:**
- Produces:
  - `normalizeDigits(value: string | null | undefined): string | null`
  - `normalizeName(value: string | null | undefined): string | null`
  - `PurchaseImportModel`, `PurchaseImportItem`
  - `parseNFeXml(input: File | string): Promise<PurchaseImportModel>`

- [ ] **Step 1: Escrever testes falhando**

Fixture mínima (string) com `nfeProc`/`infNFe`, emit CNPJ, `ide/nNF`/`serie`/`dhEmi`, `det/prod` (cProd, cEAN, xProd, qCom, vUnCom, vProd), chave em `Id` ou `chNFe`.

```ts
import { describe, expect, it } from "vitest";
import { parseNFeXml } from "@/lib/purchaseImport/parseNFeXml";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe35200112345678000190550010000000011000000010">
    <ide><nNF>1</nNF><serie>1</serie><dhEmi>2026-01-15T10:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>12345678000190</CNPJ><xNome>FORNECEDOR TESTE</xNome></emit>
    <det nItem="1"><prod>
      <cProd>ABC</cProd><cEAN>7891234567890</cEAN><xProd>PRODUTO A</xProd>
      <uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>2.5000</vUnCom><vProd>25.00</vProd>
    </prod></det>
    <total><ICMSTot><vNF>25.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

describe("parseNFeXml", () => {
  it("extrai chave, número, série, fornecedor e itens de string", async () => {
    const model = await parseNFeXml(SAMPLE);
    expect(model.source).toBe("xml");
    expect(model.externalId).toBe("35200112345678000190550010000000011000000010");
    expect(model.invoiceNumber).toBe("1");
    expect(model.invoiceSeries).toBe("1");
    expect(model.supplier.document).toBe("12345678000190");
    expect(model.items[0].supplierProductCode).toBe("ABC");
    expect(model.items[0].gtin).toBe("7891234567890");
    expect(model.items[0].quantity).toBe(10);
    expect(model.items[0].unitCost).toBe(2.5);
  });

  it("rejeita XML que não é NFe", async () => {
    await expect(parseNFeXml("<root/>")).rejects.toThrow(/NFe/i);
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `npx vitest run src/test/parseNFeXml.test.ts`  
Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Implementar model + parser**

`purchaseImportModel.ts`: tipos + `normalizeDigits` / `normalizeName`.

`parseNFeXml.ts`:
- Se `File`, `await file.text()`
- `DOMParser` + namespaces NFe (`getElementsByTagNameNS` ou localName)
- Exigir `infNFe` / estrutura NFe
- Chave: strip `NFe` prefix do `Id` ou ler `chNFe` (44 dígitos)
- Mapear itens com `supplierProductCode` ← `cProd`
- `gtin`: `cEAN` se numérico válido, senão `cEANTrib`; ignorar `SEM GTIN`
- Datas: `dhEmi` → `YYYY-MM-DD`; `dhSaiEnt`/`dSaiEnt` → `receivedAt` se houver
- Throw com mensagem amigável se inválido

- [ ] **Step 4: Rodar testes — deve passar**

Run: `npx vitest run src/test/parseNFeXml.test.ts`  
Expected: PASS

---

### Task 3: matchPurchaseImport (TDD)

**Files:**
- Create: `src/lib/purchaseImport/matchPurchaseImport.ts`
- Create: `src/test/matchPurchaseImport.test.ts`

**Interfaces:**
- Consumes: `PurchaseImportModel`
- Produces:

```ts
export type MatchCatalog = {
  suppliers: Array<{ id: string; document: string | null; name: string | null }>;
  products: Array<{
    id: string;
    external_id: string | null;
    gtin: string | null;
    sku: string | null;
    name: string;
  }>;
  productSuppliers: Array<{
    product_id: string;
    supplier_id: string;
    supplier_sku: string | null;
  }>;
};

export type ProductMatchCriteria =
  | "external_id"
  | "gtin"
  | "supplier_product_code"
  | "sku"
  | "name"
  | null;

export function matchPurchaseImport(
  model: PurchaseImportModel,
  catalog: MatchCatalog,
): MatchedPurchaseImport;
```

- [ ] **Step 1: Testes falhando**

Cobrir: match fornecedor por document; ordem de produto; supplier_product_code só com supplier matched; nome com 2 hits → `productId: null`.

- [ ] **Step 2: Implementar matching**

Para cada critério, se `candidates.length === 1` → match; se `>1` → skip critério / no auto-link (especialmente name: exigir manual).

- [ ] **Step 3: Vitest PASS**

Run: `npx vitest run src/test/matchPurchaseImport.test.ts`

---

### Task 4: Dedupe chave + createDraft extensions

**Files:**
- Create: `src/lib/purchaseImport/checkDuplicateNFe.ts`
- Create: `src/lib/purchaseImport/assertImportReady.ts`
- Create: `src/test/purchaseImportGates.test.ts`
- Modify: `src/hooks/usePurchases.ts`

**Interfaces:**
- Produces:

```ts
export async function findExistingPurchaseByNFeKey(
  companyId: string,
  externalId: string,
): Promise<{ id: string } | null>;

export function assertImportReady(input: {
  supplierId: string | null | undefined;
  items: Array<{ productId: string | null | undefined }>;
}): void; // throws se incompleto
```

- Extends `PurchaseDraftInput`:

```ts
export type PurchaseDraftInput = {
  supplier_id: string;
  issued_at: string;
  received_at?: string | null;
  invoice_number?: string | null;
  invoice_series?: string | null;
  notes?: string | null;
  source?: PurchaseSource; // default "manual"
  external_id?: string | null;
  items: PurchaseItemInput[];
};
```

- [ ] **Step 1: Teste unitário do gate**

`assertImportReady` falha sem supplier ou com item sem productId; passa quando completo.

- [ ] **Step 2: `checkDuplicateNFe`**

```ts
const { data } = await supabase
  .from("purchases")
  .select("id")
  .eq("company_id", companyId)
  .eq("source", "xml")
  .eq("external_id", externalId)
  .maybeSingle();
```

- [ ] **Step 3: Alterar `createDraft`**

```ts
source: input.source ?? "manual",
external_id: input.external_id?.trim() || null,
invoice_series: input.invoice_series?.trim() || null,
```

Tratar erro `23505` → `throw new Error("Esta NFe já foi importada.")`.

Incluir `invoice_series` nos `select` de list/detail e no type `Purchase`.

- [ ] **Step 4: Options hooks**

`useProductsOptions` retorna `gtin`, `external_id`; `useSuppliersOptions` retorna `document`.

- [ ] **Step 5: Vitest + tsc**

---

### Task 5: RegisterPurchaseDialog + PurchasesView

**Files:**
- Create: `src/components/purchases/RegisterPurchaseDialog.tsx`
- Modify: `src/components/purchases/PurchasesView.tsx`

**Interfaces:**
- Produces: `onManual()` e `onXmlReady(matched: MatchedPurchaseImport)`

- [ ] **Step 1: Dialog**

- Título: “Registrar Compra”
- Cards: Importar XML | Cadastro Manual
- Zona drag-drop + `<input type="file" accept=".xml,text/xml,application/xml">`
- Flow XML: `parseNFeXml` → se sem chave válida erro → `findExistingPurchaseByNFeKey` → se existe toast “Esta NFe já foi importada.” e **não** chama onXmlReady → senão carregar catalog (suppliers/products/product_suppliers da company) → `matchPurchaseImport` → `onXmlReady`

- [ ] **Step 2: PurchasesView**

- Botão **Registrar Compra** abre dialog (não abre sheet direto)
- Empty state → mesmo dialog
- State: `initialImport: MatchedPurchaseImport | null`
- Manual: `initialImport=null`, `selectedId=null`, open sheet
- XML: set `initialImport`, open sheet
- Subtitle: mencionar manual + XML

---

### Task 6: PurchaseSheet — revisão XML

**Files:**
- Modify: `src/components/purchases/PurchaseSheet.tsx`

**Interfaces:**
- Props:

```ts
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseId: string | null;
  initialImport?: MatchedPurchaseImport | null;
};
```

- Draft lines (UI) permitem `product_id: ""` até vínculo:

```ts
type DraftLine = {
  key: string;
  product_id: string; // "" = não localizado
  quantity: number;
  unit_cost: number;
  product_supplier_id?: string | null;
  importLabel?: string | null;
  matchCriteria?: ProductMatchCriteria;
};
```

- [ ] **Step 1: Hidratar `initialImport` no `useEffect` quando `isNew && initialImport`**

Set supplier, dates, invoice number/series/chave, lines.

- [ ] **Step 2: Read-only NFe fields**

Se import XML (new) ou purchase `source === "xml"`: número/série/chave read-only.

- [ ] **Step 3: UI linha não localizada**

Badge “Produto não localizado” + busca para setar `product_id`.

- [ ] **Step 4: Gates + CTA**

- Antes de save XML: `assertImportReady`
- Botão **Confirmar Importação** → `createDraft` com `source:"xml"`, `external_id`, `invoice_series`
- Manual new: Salvar rascunho / Confirmar compra (`source` default manual)

- [ ] **Step 5: Parent limpa `initialImport` ao fechar sheet**

---

### Task 7: Docs + validação final

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-29-feature-011-purchase-xml-import-design.md` (status implementada)

- [ ] **Step 1: README** — migration + item FEATURE 011

- [ ] **Step 2: Rodar**

```bash
npx tsc --noEmit
npx vitest run src/test/parseNFeXml.test.ts src/test/matchPurchaseImport.test.ts src/test/purchaseImportGates.test.ts
```

Expected: PASS

- [ ] **Step 3: Entregar SQL da migration** para o usuário rodar no Supabase ativo

- [ ] **Step 4: Aguardar aprovação** antes da próxima feature

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Migration invoice_series / document / gtin | 1 |
| Parser File\|string | 2 |
| PurchaseImportModel + supplierProductCode | 2 |
| Matching + ambiguidade nome | 3 |
| Dedupe após parse | 4–5 |
| createDraft source/external_id/invoice_series | 4 |
| Registrar Compra chooser + DnD | 5 |
| PurchaseSheet único + read-only + gates | 6 |
| Confirmar → draft | 6 |
| Testes | 2,3,4,7 |
| Sem Farol/BLING | Global |

## Self-review

- Sem TBD/placeholders materiais.
- Nomes: `supplierProductCode`, `matchCriteria: "supplier_product_code"`.
- Dedupe em dois pontos: UI pós-parse + unique no save.
