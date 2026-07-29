# FEATURE 011 — Registro de Compras via XML (NFe)

**Data:** 2026-07-29  
**Status:** implementada — checkpoints 1–4 aprovados; CP5 (docs + testes finais + não-regressão)

## Objetivo

Permitir registrar uma compra de duas formas, reutilizando **a mesma** estrutura e formulário do módulo de Compras (FEATURE 009):

1. Cadastro Manual (fluxo atual intacto)
2. Importação de XML da NFe (entrada)

Sem integração BLING/n8n nesta feature. O pipeline deve ser reutilizável no futuro: BLING injeta o mesmo `PurchaseImportModel`.

## Fora de escopo

- Integração BLING / n8n / sync automático
- PDF (DANFE), CSV
- Escrita no BLING
- Atualização automática de estoque
- Criação automática de produtos ou fornecedores
- Alterações em Motor Farol, Pedido, Lista, Product Suppliers (regras), Product Logistics, ComposeLogistics, views, cálculos

## Princípios

- Não criar segundo fluxo de compras nem novas entidades de “import job”.
- Parser só lê/valida XML.
- `PurchaseImportModel` independente da origem (XML hoje, BLING depois).
- Matching isolado do parser.
- `PurchaseSheet` = única tela de revisão/confirmação.
- Save = `createDraft` atual, com `source = "xml"` quando importado.

## Persistência

| Campo | Uso |
|-------|-----|
| `purchases.external_id` | **Somente** chave NFe (44 dígitos). Dedupe: unique `(company_id, source, external_id)` |
| `purchases.invoice_number` | Número da nota (não usado para unicidade) |
| `purchases.invoice_series` | **Nova** coluna text nullable — série |
| `purchases.source` | `manual` \| `xml` (valores `csv`/`bling` já existem no check; não usar bling nesta feature) |
| `suppliers.document` | **Nova** coluna text nullable — CNPJ (dígitos) |
| `products.gtin` | **Nova** coluna text nullable — EAN/GTIN |

Identidade da NFe para XML e futuro BLING: **`external_id` = chave**.

## Pipeline (abordagem 1 — frontend)

```
XML file
  → parseNFeXml()
  → PurchaseImportModel
  → matchPurchaseImport()
  → Review (PurchaseSheet + initialImport)
  → createDraft(source=xml, …)
```

Futuro BLING:

```
BLING payload → PurchaseImportModel → match → Review → createDraft(source=bling)
```

### Camadas (libs TypeScript puras + hook/UI)

| Módulo | Responsabilidade |
|--------|------------------|
| `src/lib/purchaseImport/parseNFeXml.ts` | Aceitar `File \| string` (hoje File/string no browser; futuro n8n/BLING envia string); validar NFe; extrair dados brutos |
| `src/lib/purchaseImport/purchaseImportModel.ts` | Tipos do modelo interno + normalização origem-agnóstica |
| `src/lib/purchaseImport/matchPurchaseImport.ts` | Matching fornecedor/produtos; registrar `matchCriteria` |
| UI chooser + dropzone | Escolha Manual vs XML; drag-drop / file input; **checagem de chave duplicada após parse, antes da revisão** |
| `PurchaseSheet` | Revisão única; gates; save via `usePurchases` |
| `usePurchases.createDraft` | Aceitar `source`, `external_id`, `invoice_series` |

## PurchaseImportModel (esboço)

```ts
type PurchaseImportSource = "xml"; // futuro: "bling" | …

type PurchaseImportModel = {
  source: PurchaseImportSource;
  externalId: string | null;       // chave 44
  invoiceNumber: string | null;
  invoiceSeries: string | null;
  issuedAt: string | null;         // YYYY-MM-DD
  receivedAt: string | null;
  supplier: {
    document: string | null;       // CNPJ digits
    name: string | null;
  };
  items: Array<{
    lineKey: string;
    codeInternal: string | null;   // se disponível
    gtin: string | null;           // cEAN / cEANTrib
    supplierProductCode: string | null; // cProd NFe (nem sempre é SKU)
    sku: string | null;
    name: string | null;           // xProd
    unit: string | null;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
  totalAmount: number | null;
  rawMeta?: Record<string, unknown>; // opcional, não persistido
};

type MatchedPurchaseImport = {
  model: PurchaseImportModel;
  supplierId: string | null;
  supplierMatchCriteria: "document" | null;
  items: Array<{
    lineKey: string;
    productId: string | null;
    productSupplierId: string | null;
    quantity: number;
    unitCost: number;
    matchCriteria:
      | "external_id"
      | "gtin"
      | "supplier_product_code"
      | "sku"
      | "name"
      | null;
    // matchCriteria null = não localizado ou ambíguo (auditoria interna; UI: “não localizado”)
  }>;
};
```

## Matching

### Fornecedor

1. Normalizar CNPJ (somente dígitos).
2. Buscar `suppliers` da empresa por `document`.
3. Hit → `supplierId` + `supplierMatchCriteria: "document"`.
4. Miss → `supplierId: null`; importação **não** bloqueada na leitura; usuário seleciona na revisão.

### Produtos (por item; primeiro hit **único** vence; escopo `company_id`)

1. `products.external_id` ↔ código interno do model  
2. `products.gtin` ↔ GTIN/EAN  
3. `product_suppliers.supplier_sku` ↔ `supplierProductCode` / cProd (**somente** se fornecedor já matched)  
4. `products.sku` ↔ SKU / cProd  
5. `products.name` ↔ xProd (igualdade normalizada; sem fuzzy agressivo)

**Ambiguidade:** se qualquer critério retornar **mais de um** candidato (em especial no match por nome), **não** vincular automaticamente — `productId: null`, `matchCriteria: null`, exigir seleção manual.

Registrar `matchCriteria` em cada item matched (uso interno / futura auditoria; não precisa de coluna no DB nesta feature).

## UX

1. **Registrar Compra** substitui “Nova compra”.
2. Chooser:
   - **Importar XML** — drag & drop + seletor `.xml`
   - **Cadastro Manual** — `PurchaseSheet` vazio (inalterado)
3. XML inválido / não-NFe → erro; não abre sheet.
4. Após parse bem-sucedido: se `external_id` (chave) já existir em `purchases` da empresa com `source = 'xml'` → mensagem amigável (“Esta NFe já foi importada”) e **não** abrir revisão. (Dedupe também permanece no `createDraft` via unique index.)
5. Sem duplicidade → matching → abre `PurchaseSheet` com `initialImport` (pré-preenchido).
6. Na revisão XML (read-only de conferência):
   - número (`invoice_number`)
   - série (`invoice_series`)
   - chave NFe (`external_id`)
7. Editáveis: fornecedor (select), vínculo de produto por linha, quantidades/custos conforme formulário atual (revisão).
8. Linha sem produto (não achou ou ambíguo): badge **Produto não localizado** + busca para vincular.
9. CTA XML: **Confirmar Importação** → `createDraft` (status **draft**).
10. Manual: botões atuais (“Salvar rascunho”, “Confirmar compra”).

## Gates antes do createDraft (origem XML)

Bloquear se:

- `supplier_id` ausente, **ou**
- qualquer item sem `product_id`

Mensagem clara pedindo resolver pendências. Não criar produtos automaticamente. Não gravar `purchase_items` sem `product_id`.

## Save

Estender `PurchaseDraftInput` / `createDraft`:

- `source: "manual" | "xml"` (default `manual` para fluxo atual)
- `external_id?: string | null`
- `invoice_series?: string | null`

Comportamento:

- `status: draft` (igual hoje)
- Dedupe: violação unique `(company_id, source, external_id)` → erro amigável (“NFe já importada”)
- Totais: `sumPurchaseTotal` existente
- Sem alterar regras de confirm/cancel/delete

## Migrations

Arquivo sugerido: `supabase/migrations/20260729200000_feature_011_purchase_xml_import.sql`

- `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_series text;`
- `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS document text;`
- Índice útil: `(company_id, document)` onde document not null
- `ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin text;`
- Índice útil: `(company_id, gtin)` onde gtin not null
- Atualizar types gerados / manuais em `types.ts`
- Grants/RLS: sem mudança de política (colunas nas mesmas tabelas)

## Testes

- Unit: `parseNFeXml` (NFe válida, XML inválido, não-NFe)
- Unit: matching (cada critério; ordem; supplier_product_code só com fornecedor; nome ambíguo → sem auto-vínculo)
- Unit/UI flow: chave duplicada após parse bloqueia revisão
- Unit/integration leve: gate (bloqueia sem supplier / sem product)
- Não alterar testes do motor Farol

## Não regressão

- Cadastro manual idêntico (source continua `manual` por default)
- Farol / logistics / product_suppliers write UI / views intocados
- Purchase Engine de status/totais reutilizado

## Aceite (checklist)

- [x] “Nova Compra” → “Registrar Compra”
- [x] Escolha Manual vs XML (drag-drop + file)
- [x] XML preenche formulário existente
- [x] Duplicidade da chave bloqueia revisão com mensagem amigável (antes do sheet)
- [x] Número, série e chave read-only na revisão
- [x] Fornecedor + todos os produtos obrigatórios antes do draft
- [x] Nome ambíguo não auto-vincula
- [x] Compra criada via fluxo atual, `source = xml`, `external_id` = chave
- [x] `matchCriteria` registrado internamente por item (`supplier_product_code` para cProd)
- [x] Parser aceita `File | string`
- [x] Pipeline pronto para BLING injetar o mesmo model
