# FEATURE 010 — Logística Inteligente de Compra

**Data:** 2026-07-29  
**Status:** implementada (aguardando aprovação antes da próxima feature)

## Objetivo

Transformar quantidade já calculada (`sugestao_compra` / qty de compra) em composição logística (`composeLogistics`). Não altera Motor, views, totais nem regras de compra.

## Modelo

Tabela `product_logistics`:

- `base_units` — equivalência absoluta em unidades-base
- `level_order` — só ordem visual (drag-and-drop)
- Decomposição: sempre `base_units DESC`
- Resto: `"N unidades"` (sem nível Unidade)
- Unique: `(company_id, product_id, unit_name)` e `(company_id, product_id, base_units)`
- Índice: `(company_id, product_id, active)`
- RLS: authenticated por `company_id` (padrão Sprint 0)

Migration: `supabase/migrations/20260729190000_feature_010_product_logistics.sql`

## Código

| Peça | Path |
|------|------|
| Lib | `src/lib/composeLogistics.ts` |
| Hook | `src/hooks/useProductLogistics.ts` |
| UI cadastro | `ProductLogisticsPanel` + aba no `ProductSuppliersSheet` |
| Lista | label em `SupplierOrderView` (somente display) |
| Compras | label em `PurchaseSheet` (somente visual) |
| Types | `product_logistics` em `src/integrations/supabase/types.ts` |
| Testes unitários | `src/test/composeLogistics.test.ts` |
| Testes integração | `src/test/composeLogistics.integration.test.ts` |

## Fluxo

```
Motor de Abastecimento → Quantidade Necessária → composeLogistics() → Sugestão Logística → Lista / Compras
```

Sem alteração em SQL do motor, views Farol, regras de compra, estoque ou custos.

## Uso futuro

`composeLogistics(qty, levels)` é independente da origem (manual, BLING, XML, CSV → purchase_items).

## Validação (2026-07-29)

- `npx tsc --noEmit` → exit 0
- `npx vitest run src/test/composeLogistics.test.ts src/test/composeLogistics.integration.test.ts` → 9 tests passed
- Exemplos do algoritmo:
  - 237 → 3 Fardos · 1 Caixa · 9 unidades
  - 6340 → 1 Pallet · 1 Camada · 4 unidades
  - sem config → N unidades

## Ops

Aplicar a migration no projeto Supabase **ativo** (SQL Editor ou CLI). O MCP local só lista projetos inativos; aplicar manualmente no host em uso pela app.
