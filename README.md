# FAROL Zero18

Sistema de **inteligência de estoque** e **sugestão de compra**, integrado ao BLING via n8n.

## Setup

```bash
npm install
cp .env.example .env   # preencha as variáveis
npm run dev
```

### Variáveis de ambiente

Veja `.env.example`. Obrigatórias:

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave anon (RLS aplica-se; leitura exige usuário autenticado) |

**Autenticação:** o app exige login Supabase Auth. A empresa (`company_id`) vem de `profiles.company_id` — não há UUID padrão no frontend nem `VITE_SKIP_AUTH`.

## Migrations (ordem)

Rodar no SQL Editor do projeto Supabase (ou via CLI), na ordem dos timestamps:

| Arquivo | Função |
|---------|--------|
| `20260401031315_…` / `20260401032438_…` / `20260401034355_…` | Base inicial / views Farol |
| `20260706180000_bling_integration.sql` | Integração BLING |
| `20260706200000_farol_production_ready.sql` | Produção + RLS autenticado |
| `20260706210000` … `20260708210000` | Constraints upsert / SKU / movements |
| `20260713120000_fix_negative_stock_suggestion.sql` | Sugestão com estoque negativo |
| `20260713140000_consumption_window_14d.sql` | Janela de consumo |
| `20260728120000_product_suppliers.sql` | FEATURE 001 — `product_suppliers` |
| `20260728130000_feature_002_backfill_product_suppliers.sql` | FEATURE 002 — backfill |
| `20260728140000_feature_003_dual_write_product_suppliers.sql` | FEATURE 003 — dual-write |
| `20260728150000_feature_004_dual_read_pedido_fornecedor.sql` | FEATURE 004 — dual-read view |
| `20260728160000_feature_005_calc_primary_lead_time.sql` | FEATURE 005 — calc + lead time (**views canônicas**) |
| `20260729120000_feature_006_product_suppliers_write_rls.sql` | FEATURE 006 — RLS write (substituída em parte pelo Sprint 0) |
| `20260729140000_feature_007_commercial_structure.sql` | FEATURE 007 — brands / categories |
| `20260729160000_feature_009_purchases_module.sql` | FEATURE 009 — purchases (idempotente, sem DROP) |
| `20260729180000_sprint0_hardening_rls_indexes.sql` | **Sprint 0** — RLS company-scoped + índices |
| `20260729190000_feature_010_product_logistics.sql` | FEATURE 010 — `product_logistics` |
| `20260729200000_feature_011_purchase_xml_import.sql` | FEATURE 011 — importação XML NFe (`invoice_series`, `suppliers.document`, `products.gtin`) |
| `20260804210000_inventory_movements_write_rls.sql` | FEATURE 012 — RLS write em `inventory_movements` (trigger de compra) |
| `20260804220000_feature_012_align_purchase_items_schema.sql` | FEATURE 012 — `purchase_items.company_id` + `total_cost` generated |
| `20260804221000_feature_012_import_purchase_nfe_rpc.sql` | FEATURE 012 — RPC `import_purchase_nfe` + helpers de match |
| `20260804222000_feature_012_purchase_stock_trigger.sql` | FEATURE 012 — trigger `purchases.status` → estoque entrada/reversão |
| `20260805120000_feature_012_ensure_supplier.sql` | FEATURE 012 — auto-cria fornecedor pelo CNPJ da NFe (`fz_ensure_supplier`) |

Views Farol atuais = definição em **FEATURE 005**.

## Arquitetura atual

```
Login (Supabase Auth)
  → profiles.company_id
  → useFarol (stock_analysis / farol_lista_compra)  [Pedido | Análise]
  → PurchasesView (purchases / purchase_items)      [Compras]
```

- **Frontend:** React + Vite + TanStack Query  
- **Cálculo Farol:** views SQL (`stock_analysis`, `farol_lista_compra`, `farol_pedido_fornecedor`) + `src/lib/farolCalculations.ts` (status/helpers)  
- **Fornecedor:** dual-read `product_suppliers` (primary) ↔ `products.supplier_id`  
- **Comercial:** `brands`, `categories`  
- **Compras:** `purchases` + `purchase_items`  
- **ERP:** BLING API v3 via n8n (`n8n/README-bling-sync.md`) — workflows incl. `farol-bling-sync-compras.json` (012, NF-e entrada) e vendas; usar **service_role** (bypassa RLS)

### Stack UI ativa

| Aba | Hook / componente |
|-----|-------------------|
| Pedido | `useFarol("pedido")` → `SupplierOrderView` |
| Análise | `useFarol("analise")` → `FarolFullTable` |
| Compras | `usePurchases` → `PurchasesView` / `PurchaseSheet` |

Janela de consumo e cobertura vêm de `companies.consumption_window_days` / `coverage_days` (não há seletor de período na UI — evita inconsistência com as views).

## FEATURES 001–012 (resumo)

1. **001** — Tabela `product_suppliers`  
2. **002** — Backfill de vínculos  
3. **003** — Dual-write trigger products → product_suppliers  
4. **004** — Dual-read na view pedido  
5. **005** — Cálculo com primary + lead_time  
6. **006** — UI vínculos produto↔fornecedor  
7. **007** — Marcas e categorias  
8. **008** — Lista de compra inteligente (agrupamento UI)  
9. **009** — Fundação módulo de compras  
10. **010** — Logística inteligente (`product_logistics` + `composeLogistics`)  
11. **011** — Registro de compras via XML NFe (`parseNFeXml` → matching → `PurchaseSheet` → `createDraft` com `source=xml`)
12. **012** — Importação automática NFe entrada BLING → RPC `import_purchase_nfe` + estoque na confirmação (trigger em `purchases.status`; cancel reverte)

**Sprint 0** — Hardening: RLS, auth, paginação lista, migration 009 segura, índices, remoção de código morto, docs.

## Segurança (Sprint 0)

- Policies **anon** permissivas (`USING (true)`) removidas das tabelas multi-tenant.  
- Acesso de app: role **authenticated** filtrado por `profiles.company_id`.  
- n8n / sync: **service_role** (não usar anon key para escrita em massa).

## Testes

```bash
npm test
npx tsc --noEmit
```
