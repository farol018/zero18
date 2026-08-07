# FEATURE 016 — Pedido Farol → rascunho de compra

**Data:** 2026-08-06  
**Status:** implementada no repo — aplicar migration `source=farol` no live e smoke no Pedido  
**Depende de:** FEATURE 009 (compras), 015 (custo nas linhas do pedido)  
**Roadmap:** `docs/superpowers/specs/2026-08-06-roadmap-pos-012-design.md`

## Objetivo

No **Pedido**, gerar um **rascunho de compra** a partir das linhas sugeridas de um fornecedor (todas ou só as selecionadas), abrir a tela de revisão de Compras (`PurchaseSheet`) e salvar com `source = farol`. Confirmação usa os mesmos gatilhos de estoque (012) e custo (015).

## Decisões de produto

| Tema | Decisão |
|------|---------|
| Entrada UX | Botão **Gerar compra** por fornecedor **+** checkboxes por linha |
| Sem seleção | Gera com **todas** as linhas elegíveis do fornecedor |
| Com seleção | Só linhas marcadas (elegíveis) |
| Pós-clique | Abre **PurchaseSheet** pré-preenchido para revisar qty/custo e salvar |
| Origem | `source = 'farol'` (CHECK + labels) |
| Sem fornecedor | Bloco sem `supplier_id`: **sem** botão Gerar |
| Sem custo | Linhas com `cost_price` null/ausente: **omitidas** + toast; se zero linhas restantes → não gera |
| Qty inicial | `Math.round(sugestao_compra)` (mesma métrica do pedido) |
| Custo inicial | `FarolItem.cost_price` (já dual-read / 015) |
| Escopo aba | **Só Pedido** (`SupplierOrderView`) no MVP — Análise fora |
| BLING export | **Fora** → FEATURE **016.1** |

## Fora de escopo

- Enviar pedido de compra ao BLING  
- Gerar a partir da aba Análise  
- Compra multi-fornecedor num único draft (`createDraft` é 1 `supplier_id`)  
- Criar fornecedor/produto na hora  
- Deduplicar drafts Farol abertos do mesmo fornecedor (permitir vários; operador decide)  
- Alterar views Farol / motor de sugestão  

## Fluxo (usuário)

```
Pedido → bloco Fornecedor X
  [ ] linha A   [ ] linha B   …
  [Gerar compra]  (junto a Copiar / WhatsApp / PDF)

        │
        ▼
Filtra elegíveis (tem custo; qty > 0)
  · se nenhuma → toast erro, para
  · se omitiu sem custo → toast aviso com contagem
        │
        ▼
Abre PurchaseSheet (nova compra)
  supplier = X
  issued_at = hoje
  source = farol
  itens = qty + unit_cost pré-preenchidos
        │
        ▼
Usuário revisa → Salvar rascunho → lista Compras
  (confirm/cancel iguais aos de sempre)
```

## Arquitetura

```
SupplierOrderView
  selection state (product_id set por supplier)
  buildFarolPurchaseSeed(supplier, items|selected)
        │
        ▼
Index (ou PurchasesView host)
  setMode("compras") + open PurchaseSheet with seed
        │
        ▼
PurchaseSheet
  initialFarolSeed → lines + supplierId + source farol
  createDraft({ source: "farol", … })
```

Lógica pura de mapeamento em `src/lib/purchaseImport/buildFarolPurchaseSeed.ts` (testável com Vitest) — **não** embutir regras só no JSX.

## Componentes

### 1. Migration `source`

- Alterar CHECK `purchases_source_check` para incluir `'farol'`  
- Arquivo: `supabase/migrations/20260806160000_feature_016_purchase_source_farol.sql`

### 2. Tipos / labels

- `PurchaseSource` += `"farol"`  
- `SOURCE_LABELS.farol = "Farol"`  
- Lista Compras mostra origem Farol  

### 3. `buildFarolPurchaseSeed`

Entrada: `supplier_id`, `supplier_name`, `FarolItem[]` (já filtradas pela UI ou filtradas aqui).  
Saída:

```ts
type FarolPurchaseSeed = {
  supplierId: string;
  supplierName: string;
  issuedAt: string; // YYYY-MM-DD
  source: "farol";
  items: Array<{
    product_id: string;
    productName: string | null;
    productSku: string | null;
    quantity: number;
    unit_cost: number;
  }>;
  skippedNoCost: number;
  skippedNonPositiveQty: number;
};
```

Regras:
- `quantity = Math.round(sugestao_compra ?? 0)`; pular se `<= 0`  
- pular se `cost_price == null` ou `!Number.isFinite(cost_price)`  
- `unit_cost = Number(cost_price)`  
- se `items.length === 0` → seed inválido (UI não abre sheet)

### 4. UI Pedido (`SupplierOrderView`)

- Checkbox por linha (estado: `Set` de `product_id` por `supplier_id`)  
- “Selecionar todas / limpar” opcional no header do bloco (nice-to-have MVP)  
- Botão **Gerar compra** só se `supplier_id` truthy e ≠ placeholder sem fornecedor  
- Ao clicar: resolve lista (seleção ou todas) → `buildFarolPurchaseSeed` → callback `onGeneratePurchase(seed)`  

### 5. `PurchaseSheet` + `Index` / `PurchasesView`

- Nova prop `initialFarolSeed?: FarolPurchaseSeed | null` (paralela a `initialImport` XML)  
- Prefill supplier, issuedAt, lines, `source` farol no save  
- Host: ao receber seed, abrir sheet de nova compra (trocar para aba Compras se necessário)

### 6. `createDraft`

- Já aceita `source` opcional — passar `"farol"`  
- Sem mudança de schema além do CHECK  

## Aceite

- [ ] Gerar sem seleção → draft com todas linhas elegíveis do fornecedor  
- [ ] Gerar com 2 linhas marcadas → só essas  
- [ ] Sem fornecedor → sem botão  
- [ ] Linhas sem custo omitidas + toast; zero elegíveis → não abre sheet  
- [ ] Sheet salva `source=farol`; lista mostra “Farol”  
- [ ] Confirmar draft → estoque + custo (012/015)  
- [ ] Copiar / WhatsApp / PDF intactos  

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Navegação Pedido → Compras | Centralizar estado do sheet no `Index` |
| Qty 0 / custo null | Filtro no builder + testes |
| Dual-write / product_supplier_id | MVP deixa `product_supplier_id` null (como XML parcial) |

## Histórico de decisão

| Data | Decisão |
|------|---------|
| 2026-08-06 | Botão por fornecedor + checkboxes |
| 2026-08-06 | Abrir PurchaseSheet para revisar |
| 2026-08-06 | `source = farol` |
| 2026-08-06 | Sem fornecedor: sem Gerar |
| 2026-08-06 | Sem custo: omitir + avisar |
| 2026-08-06 | BLING export = 016.1 |
