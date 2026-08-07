# FEATURE 017 — BI operacional de compras

**Data:** 2026-08-07  
**Status:** implementada no repo — aguardando apply migration + aceite UI  
**Depende de:** FEATURE 009–012 (compras + BLING), 016 (`source=farol` enriquece drafts)  
**Roadmap:** `docs/superpowers/specs/2026-08-06-roadmap-pos-012-design.md`

## Objetivo

Painel gerencial **leve** no app (sem ferramenta de BI externa) respondendo: quanto entrou em compras, o que ainda está em rascunho, qualidade de fechamento no período e top fornecedores. Escopo MVP = **compras**. Visão Farol/estoque fica para **FEATURE 018**.

## Decisões de produto

| Tema | Decisão |
|------|---------|
| Público | Operação / gestão de compras |
| Onde | Nova aba **Gestão** (Pedido \| Análise \| Compras \| Gestão) |
| Período | Fixo: cards **14 dias** e **30 dias** lado a lado (sem seletor) |
| Métricas | Pacote B (abaixo) |
| Fonte | RPC SQL `get_purchase_ops_kpis` + UI fina |
| Marketplace rejeitado | **Fora** (hoje só no Resultado n8n) |
| BI Farol | **018** (não confundir com PATCH 017.1 de leitura da Gestão) |

## Métricas MVP

### Janelas 14d e 30d (`issued_at`)

Por janela (`[hoje − (N−1), hoje]` com `N ∈ {14,30}`):

| Campo | Definição |
|-------|-----------|
| `confirmed_count` | Nº de compras `status = confirmed` |
| `confirmed_amount` | `sum(total_amount)` das confirmed |
| `cancelled_count` | Nº de compras `status = cancelled` |
| `confirmed_vs_draft_pct` | `confirmed / (confirmed + draft)` na janela × 100; se denominador 0 → `null` |

Cancelados **não** entram no denominador do %. São exibidos à parte.

### Drafts abertos (agora, sem janela)

| Campo | Definição |
|-------|-----------|
| `total` | `status = draft` |
| `bling` / `farol` / `other` | Breakdown por `source` (`other` = manual + xml + csv + qualquer valor restante) |

### Top fornecedores

- Janela: **30 dias**
- Só `confirmed`
- Top **5** por `sum(total_amount)` desc
- Campos: `supplier_id`, `name`, `amount`, `count`

## Fora de escopo

- BI Farol (ruptura, cobertura, valor em risco) → **018**
- Rejeições marketplace / telemetria n8n no banco
- Gráficos, seletor de período, date picker
- Drill-down obrigatório / navegação para Compras (pode vir depois)
- Export CSV
- Alterar sync n8n ou RPC `import_purchase_nfe`
- Materialized views / cron

## Arquitetura

```
Index (tab Gestão)
  → GestaoView
    → usePurchaseOpsKpis(companyId)
      → POST/rpc get_purchase_ops_kpis
        → aggregates on public.purchases (+ suppliers.name)
```

**Abordagem rejeitada no MVP:** agregar só no React a partir da lista de compras (paginação, volume, divergência de regra).

### Contrato RPC

`get_purchase_ops_kpis(p_company_id uuid) RETURNS jsonb`

Shape:

```json
{
  "windows": {
    "d14": {
      "confirmed_count": 0,
      "confirmed_amount": 0,
      "cancelled_count": 0,
      "confirmed_vs_draft_pct": null
    },
    "d30": { "...": "same keys" }
  },
  "drafts_open": {
    "total": 0,
    "bling": 0,
    "farol": 0,
    "other": 0
  },
  "top_suppliers_d30": [
    { "supplier_id": "...", "name": "...", "amount": 0, "count": 0 }
  ]
}
```

**Segurança:** mesmo padrão das RPCs existentes do tenant (`company_id` + membership / RLS). Preferir alinhamento com RPCs já em produção.

**Índices:** `purchases_company_issued_at_idx` e `purchases_company_status_idx` bastam no MVP.

**Timezone:** datas via `CURRENT_DATE` no Postgres do projeto (já usado em compras).

## UI

1. **Entradas** — dois cards (14d / 30d): valor + nº NFs confirmadas; linha secundária com cancelados e %.
2. **Drafts abertos** — total + breakdown por origem.
3. **Top fornecedores (30d)** — lista texto (nome · R$ · nº NFs).

Estados: skeleton, vazio (“ainda sem compras confirmadas”), erro + retry. Botão **Atualizar** no header da aba (padrão Pedido/Análise).

Visual: reutilizar tokens/cards do Farol; sem dashboard genérico com gráfico decorativo.

## Arquivos previstos

| Peça | Caminho |
|------|---------|
| Migration | `supabase/migrations/YYYYMMDDHHMMSS_feature_017_purchase_ops_kpis.sql` |
| Hook | `src/hooks/usePurchaseOpsKpis.ts` |
| View | `src/components/gestao/GestaoView.tsx` (+ subcomponentes se necessário) |
| Tab | `src/pages/Index.tsx` |
| Testes | unitário do parse/format do payload; smoke SQL no Editor |

## Aceite

- [ ] Migration aplicada no live
- [ ] Aba Gestão visível e carrega KPIs
- [ ] 14d/30d coerentes com compras confirmadas na lista (mesma `issued_at`)
- [ ] Drafts abertos batem com filtro Rascunho (+ origem quando aplicável)
- [ ] Top 5 bate com confirmados dos últimos 30 dias
- [ ] Loading / vazio / erro ok

## FEATURE 018 (só nomeada; ex-“017.1” no roadmap)

Painel / cards de saúde Farol (ruptura, cobertura, etc.) — **fora** desta entrega; spec própria quando priorizar.

**PATCH 017.1** = refino de leitura da aba Gestão (drafts R$, taxa, ticket, % top) — já entregue; não é BI Farol.

## Histórico

| Data | Decisão |
|------|---------|
| 2026-08-07 | MVP = BI compras; Farol → 018 (renumerado; evita colisão com PATCH 017.1) |
| 2026-08-07 | Aba Gestão; período fixo 14/30; métricas pacote B; % = confirmed/(confirmed+draft) |
| 2026-08-07 | RPC SQL + UI fina; sem marketplace no banco |
