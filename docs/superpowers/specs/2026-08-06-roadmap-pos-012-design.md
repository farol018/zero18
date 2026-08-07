# Roadmap pós–FEATURE 012 — Farol Zero18

**Data:** 2026-08-06  
**Status:** planejamento aprovado (sem implementação nesta etapa)  
**Contexto:** FEATURES 001–012 (+ 012.1 EBAZAR) no ar; sync compras BLING em estabilização.

## Objetivo deste documento

Ordenar as **próximas fases** do produto depois do MVP de compras (XML + BLING), sem abrir implementação ainda. Cada FEATURE futura terá spec + plan próprios quando for a hora.

## Prioridade do negócio (decidida)

Do mais para o menos importante:

1. **Farol sugere, mas não vira compra fácil** → fechar o ciclo operacional  
2. **Falta visão gerencial** → painel / números  
3. **Higiene de sync/cadastro** → melhora com o tempo conforme o BLING sincroniza; não bloqueia 1 e 2  

## Estado atual (baseline)

| Bloco | Status |
|-------|--------|
| Motor Farol (views, lista, pedido, logística) | 001–010 feitos |
| Compras manuais + XML | 009 + 011 |
| Compras automáticas BLING entrada | 012 + 012.1 (bloqueio marketplace) |
| Estoque na confirmação / cancel | trigger `purchases.status` |

**Fora de escopo permanente (até nova decisão):** criar produto automático na importação; fluxo completo de devolução; PDF/SEFAZ direto; reescrever match no n8n.

## Fase 0 — Fechar 012 (ops, não é FEATURE)

- Aceite da sync com `nfe_max_detalhe` adequado  
- Revisar drafts na UI  
- Push dos commits locais quando o time quiser  
- Confirmar que EBAZAR não recria compra e estoque faz sentido  

Não gera número de FEATURE.

---

## FEATURE 015 — Custo a partir de compras *(1ª a implementar, quando sair do planejamento)*

**Spec detalhada:** `docs/superpowers/specs/2026-08-06-feature-015-last-cost-from-purchases-design.md` (aprovada 2026-08-06).

**Por quê primeiro:** 012 já gera histórico confirmado; 016 (gerar compra) precisa de custo confiável para não reincitar preço errado.

**Objetivo:** ao confirmar compra, gravar **último custo** em `products.cost_price` e em `product_suppliers.cost_price` do fornecedor da compra (se existir vínculo). Cancel não recalcula. Trigger SQL + backfill one-shot.

**Dependências:** 009–012 estáveis.

---

## FEATURE 016 — Pedido → compra *(2ª)*

**Spec:** `docs/superpowers/specs/2026-08-06-feature-016-pedido-to-purchase-design.md`  
**Plan:** `docs/superpowers/plans/2026-08-06-feature-016-pedido-to-purchase.md`

**Objetivo:** a partir do Pedido Farol, gerar `purchases` draft `source=farol` (todas as linhas ou seleção), revisar no PurchaseSheet.

**Dependências:** 015 (custo); 009 UI compras.

---

## FEATURE 017 — BI operacional *(3ª)*

**Objetivo:** painel simples para gestão, sem projeto de analytics separado.

**Métricas candidatas:**

- Entradas (compras confirmadas) últimos 14/30 dias — valor e qtd  
- % match / drafts abertos (`source=bling`)  
- Top fornecedores por volume  
- Cancelamentos / rejeições marketplace (ops)  

**Direção:** views SQL + aba ou página leve no app; sem BI externo no MVP da 017.

**Dependências:** volume de compras 011/012; 016 enriquece se “origem Farol” existir.

---

## FEATURE 013 / 014 — Hardening sync *(4ª, leve / sob demanda)*

Tratar **depois** de 015–017, ou só o pedaço que ainda doer:

| Tema | Exemplos |
|------|----------|
| 013 Sync | Checkpoint/cursor; fila justa além do teto de detalhe; docs ops |
| 014 Cadastro/match | Dedup `nfe-doc:*` vs fornecedor BLING; ambiguidade GTIN; UX de drafts |

**Premissa do produto:** sujeira de sync tende a cair conforme o histórico sincroniza; não priorizar à frente do ciclo pedido→compra nem do BI.

---

## Ordem de execução (quando sair do modo planejamento)

```
Fase 0 (ops 012)
  → Spec + plan + impl FEATURE 015 (custo)
  → Spec + plan + impl FEATURE 016 (pedido → compra)
  → Spec + plan + impl FEATURE 017 (BI)
  → 013/014 só se ainda houver dor mensurável
```

Cada FEATURE: brainstorm/spec → plan → SDD/implementação → aceite. **Este arquivo não autoriza código.**

## Decisões em aberto (para specs futuras)

1. FEATURE 016: origem `source` do draft gerado pelo Farol; escopo BLING export (016 vs 016.1).  
2. FEATURE 017: métricas exatas do painel MVP.

(015: decisões fechadas na spec dedicada.)

## Histórico de decisão

| Data | Decisão |
|------|---------|
| 2026-08-06 | Prioridade negócio: (2) pedido→compra → (3) BI → (1) higiene sync |
| 2026-08-06 | Numeração: 015 custo, 016 pedido→compra, 017 BI; 013/014 hardening no fim |
| 2026-08-06 | Somente planejamento; sem implementação nesta etapa |
| 2026-08-06 | Spec 015 aprovada (último custo → products + PS; cancel não recalcula) |
| 2026-08-06 | Manter ordem 015 → 016 → 017; **não** entregar BI meia-boca; pressão de BI tratada com comunicação + ordem definida |
| 2026-08-06 | FEATURE 015: migration no repo; aguardando apply live + aceite |
