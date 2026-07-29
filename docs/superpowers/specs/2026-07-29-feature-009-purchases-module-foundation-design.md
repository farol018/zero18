# FEATURE 009 — Módulo de Compras (Fundação) — Design

**Date:** 2026-07-29  
**Status:** Approved for implementation

## Goal

Criar a estrutura para o FAROL registrar e consultar compras realizadas (CRUD manual). Não implementar BI, dashboards, análises nem importações (XML/CSV/BLING).

## Non-goals

- Motor de Abastecimento, Lista de Compra, views Farol, n8n, BI, logística
- Alterar lógica de `product_suppliers` (apenas FK nullable em `purchase_items`)
- Importação XML / CSV / BLING
- Custo médio, estorno contábil, edição de compra confirmada

## Decisions

| Topic | Decision |
|-------|----------|
| Status | `draft` \| `confirmed` \| `cancelled` |
| Editability | `draft` = edita tudo; `confirmed` = **imutável**; `cancelled` = só leitura |
| Correção pós-confirmação | Cancelar + criar nova compra (nunca editar confirmed) |
| Exclusão | Hard delete só em `draft`; `confirmed` → Cancelar (`cancelled`) |
| Total | `total_amount` = soma de `purchase_items.total_cost` |
| Datas | `issued_at` (documento) + `received_at` (nullable) |
| Origem | `source` + `external_id` + unique parcial; UI mostra origem (MVP = Manual) |
| UI | Aba **Compras** no Index |
| Arquitetura | CRUD cliente → Supabase; sem triggers de imutabilidade nesta feature |

## Data model

### `purchases`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| company_id | uuid NOT NULL | FK → companies |
| supplier_id | uuid NOT NULL | FK → suppliers |
| issued_at | date NOT NULL | data do documento/compra |
| received_at | date NULL | recebimento (pode = issued_at) |
| invoice_number | text NULL | |
| total_amount | numeric NOT NULL DEFAULT 0 | derivado dos itens no save |
| status | text NOT NULL DEFAULT `'draft'` | check: draft/confirmed/cancelled |
| notes | text NULL | |
| source | text NOT NULL DEFAULT `'manual'` | check: manual/xml/csv/bling |
| external_id | text NULL | idempotência de import futuro |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

**Constraints**
- `CHECK (status IN ('draft','confirmed','cancelled'))`
- `CHECK (source IN ('manual','xml','csv','bling'))`
- Unique parcial: `UNIQUE (company_id, source, external_id) WHERE external_id IS NOT NULL`

**RLS:** mesmo padrão FEATURE 006/007 (anon single-tenant + authenticated via profiles).

### `purchase_items`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| purchase_id | uuid NOT NULL | FK → purchases ON DELETE CASCADE |
| product_id | uuid NOT NULL | FK → products |
| product_supplier_id | uuid NULL | FK → product_suppliers ON DELETE SET NULL |
| quantity | numeric NOT NULL | > 0 |
| unit_cost | numeric NOT NULL | >= 0 |
| total_cost | numeric NOT NULL | quantity × unit_cost no save |
| created_at | timestamptz NOT NULL DEFAULT now() | |

**RLS:** via EXISTS na purchase da mesma company.

## Status rules (runtime)

1. **draft** — criar/editar header e itens; Confirmar; Excluir (hard delete).
2. **confirmed** — somente leitura; único write permitido: `status → cancelled`. Qualquer correção = cancelar + nova compra.
3. **cancelled** — somente leitura; fora de histórico/custo médio/BI futuros (filtros posteriores excluem; fundação não implementa BI).

Confirmar compra exige dialog:  
*"Após confirmar, esta compra não poderá mais ser editada. Deseja continuar?"*

## UI

- Aba **Compras** no `Index` (independente do Farol carregar dados).
- Lista: issued_at, fornecedor, NF, status colorido (🟡 draft / 🟢 confirmed / 🔴 cancelled), total, qtd itens; filtro por status; Nova compra.
- Sheet: header (fornecedor, issued_at, received_at, NF, notes, origem readonly, status) + linhas de itens; total readonly.
- Em draft: add/remove produtos, editar qty/custo, salvar, confirmar, excluir.
- Em confirmed: Cancelar.
- Em cancelled: só visualizar.
- `product_supplier_id` não exigido na UI MVP (permanece null).

## Future integrations (prepared, not built)

Importadores XML/CSV/BLING gravarão nas mesmas tabelas com `source` + `external_id`, aproveitando o unique parcial. `product_supplier_id` e `received_at` evitam migrations futuras.

## Validation deliverables

- Tabelas e relacionamentos criados
- Componentes da aba Compras
- Migration aplicada
- Explicar como a estrutura sustenta histórico futuro
- Confirmar: nenhuma regra de Farol/views/n8n alterada

## Spec self-review (2026-07-29)

- Sem placeholders TBD/TODO.
- `confirmed` imutável explícito; correção = cancelar + nova compra.
- `purchase_date` substituído por `issued_at`/`received_at`.
- `product_supplier_id` nullable documentado.
- Unique parcial `external_id` documentado.
- Escopo sem BI/import/Farol coerente.
- Consistência UI: origem readonly, badges, dialog de confirmação.
