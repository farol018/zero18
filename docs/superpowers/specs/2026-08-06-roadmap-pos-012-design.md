# Roadmap pós–FEATURE 012 — Farol Zero18

**Data:** 2026-08-07 (atualizado)  
**Status:** ciclo 015–017 **entregue**; próximos passos definidos abaixo  
**Contexto:** Farol 001–010 + compras 011/012/012.1 + custo 015 + Pedido→compra 016 + Gestão 017 (+ PATCH leitura) no ar / na branch `feature/017-purchase-ops-bi`.

## Objetivo deste documento

Ordenar fases do produto depois do MVP de compras e registrar o que já fechou vs o que falta. Cada FEATURE futura terá spec + plan próprios quando for a hora.

## Prioridade do negócio (decidida)

**Histórico (já cumprido):** ciclo pedido→compra → BI compras (015–017).

**Próximos (default sem dor aguda):**

1. **Merge git** → `main` (ops)  
2. **016.1** export compra → BLING  
3. **014** cadastro/match  
4. **013** hardening sync  
5. **018** BI Farol/estoque  

Por dor: ver tabela em “Ordem sugerida”.

## Estado atual (baseline)

| Bloco | Status |
|-------|--------|
| Motor Farol (views, lista, pedido, logística) | 001–010 feitos |
| Compras manuais + XML | 009 + 011 |
| Compras automáticas BLING entrada | 012 + 012.1 (bloqueio marketplace + filtro na lista) |
| Estoque na confirmação / cancel | trigger `purchases.status` |
| Último custo na confirmação | **015** feito |
| Pedido → draft `source=farol` | **016** feito |
| Aba Gestão (KPIs compras) | **017** feito |
| Refino de leitura Gestão (drafts R$, taxa, ticket, % top) | **PATCH 017.1** feito *(não é BI Farol)* |

**Git (ops):** branch `feature/017-purchase-ops-bi` @ remote; falta **merge → `main`** (+ push `main`).

**Fora de escopo permanente (até nova decisão):** criar produto automático na importação; fluxo completo de devolução; PDF/SEFAZ direto; reescrever match no n8n.

---

## FEATURES entregues (015–017)

### FEATURE 015 — Custo a partir de compras

**Spec:** `docs/superpowers/specs/2026-08-06-feature-015-last-cost-from-purchases-design.md`  
Ao confirmar compra: último `unit_cost` → `products.cost_price` + `product_suppliers` do fornecedor; cancel não recalcula.

### FEATURE 016 — Pedido → compra

**Spec:** `docs/superpowers/specs/2026-08-06-feature-016-pedido-to-purchase-design.md`  
Pedido → draft `source=farol` → PurchaseSheet. Export BLING → **016.1**.

### FEATURE 017 — BI operacional de compras

**Spec:** `docs/superpowers/specs/2026-08-07-feature-017-purchase-ops-bi-design.md`  
Aba Gestão: RPC `get_purchase_ops_kpis`; 14/30d; drafts; top 5; cancelados; taxa de fechamento.

**PATCH 017.1 (refino UI/RPC mínimo):** valor total dos drafts (`drafts_open.total_amount`), label “Taxa de fechamento”, ticket médio, % participação top fornecedores, copy “30 dias (Acumulado)”. **Não** confundir com BI Farol.

---

## Passos que faltam (definidos)

### 0. Integração git *(ops, não FEATURE)*

| | |
|--|--|
| **O quê** | Merge `feature/017-purchase-ops-bi` → `main` + push `main` |
| **Por quê** | Código oficial alinhado ao que já valida em produção |
| **Done when** | `main` no remote inclui 017 + PATCH 017.1 |

### 1. FEATURE 016.1 — Export compra → BLING

| | |
|--|--|
| **O quê** | Enviar pedido/compra do Farol para o BLING |
| **Por quê** | Fecha o ciclo no ERP (hoje para no rascunho Farol) |
| **Fora** | Reescrever match; criar produto automático |
| **Depende** | 016 estável |
| **Done when** | Operador gera no Farol e vê o pedido no BLING sem digitação manual |

### 2. FEATURE 013 — Hardening sync BLING (compras)

| | |
|--|--|
| **O quê** | Sync previsível sob volume (checkpoint/cursor, fila justa além do teto de detalhe, docs ops) |
| **Por quê** | Janela grande ainda depende de várias execuções + `nfe_max_detalhe` |
| **Fora** | Mudar regra de match/estoque |
| **Depende** | Dor mensurável (timeouts, atraso, buracos) |
| **Done when** | Sync completa a janela sem timeout crônico, com progresso rastreável |

### 3. FEATURE 014 — Cadastro / match

| | |
|--|--|
| **O quê** | Menos drafts vazios e menos lixo de fornecedor (dedup `nfe-doc:*`, ambiguidade GTIN, UX de revisão) |
| **Por quê** | Drafts “0 itens” e fornecedores auto-criados ainda poluem |
| **Fora** | Criar produto automático na importação |
| **Depende** | Volume real de drafts problemáticos |
| **Done when** | Drafts abertos caem e/ou match sobe; revisão na UI é útil |

### 4. FEATURE 018 — BI Farol / estoque

| | |
|--|--|
| **O quê** | Painel de saúde Farol (ruptura, cobertura, valor em risco, etc.) |
| **Por quê** | Análise hoje é lista operacional; falta visão gerencial de estoque |
| **Fora** | BI externo; misturar KPIs de compra da Gestão |
| **Depende** | 017 compras estável |
| **Done when** | Spec + painel com métricas Farol acordadas |
| **Numeração** | Antes chamado “017.1” no roadmap; **018** evita colisão com o PATCH de leitura da Gestão |

---

## Ordem sugerida

**Default (sem dor aguda):**

```
0. Merge feature → main (+ push)
  → 016.1 (export BLING)
  → 014 (match / drafts)
  → 013 (sync)
  → 018 (BI Farol)
```

**Por dor de negócio:**

| Gargalo | Ir para |
|---------|---------|
| Ainda digito no BLING | **016.1** |
| Muitos drafts / match ruim | **014** |
| Sync não acompanha | **013** |
| Não vejo saúde do estoque | **018** |

Cada FEATURE: brainstorm/spec → plan → implementação → aceite.

## Decisões em aberto (specs futuras)

1. **016.1** — escopo exato do payload BLING (pedido vs NF; status após envio).  
2. **018** — métricas exatas do painel Farol.  
3. **013/014** — só abrir se dor mensurável; não priorizar “por limpeza”.

(015–017 + PATCH 017.1: fechados nas specs / aceite.)

## Histórico de decisão

| Data | Decisão |
|------|---------|
| 2026-08-06 | Prioridade negócio: pedido→compra → BI compras → higiene sync |
| 2026-08-06 | Numeração: 015 custo, 016 pedido→compra, 017 BI compras; 013/014 no fim |
| 2026-08-06 | Spec 015 aprovada |
| 2026-08-07 | Spec 017 aprovada; ciclo 015–016–017 implementado e aceito |
| 2026-08-07 | PATCH 017.1 = refino leitura Gestão (não é BI Farol) |
| 2026-08-07 | BI Farol/estoque renumerado para **FEATURE 018**; próximos passos 0 / 016.1 / 013 / 014 / 018 definidos |
