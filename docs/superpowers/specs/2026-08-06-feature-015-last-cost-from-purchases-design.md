# FEATURE 015 — Último custo a partir de compras confirmadas

**Data:** 2026-08-06  
**Status:** implementada no repo — **aplicar migration no live** (`20260806150000_feature_015_last_purchase_cost.sql`) e smoke de confirm/cancel  
**Depende de:** FEATURE 009 (compras), 011/012 (volume de `purchase_items` confirmados)  
**Roadmap:** `docs/superpowers/specs/2026-08-06-roadmap-pos-012-design.md`

## Objetivo

Ao **confirmar** uma compra, atualizar o **último custo** do produto (e do vínculo produto↔fornecedor, quando existir) com o `unit_cost` das linhas da compra, para o Farol/pedido refletirem o preço real da NFe/compra.

## Decisões de produto

| Tema | Decisão |
|------|---------|
| Métrica | **Último custo** apenas (não média ponderada no MVP) |
| Fonte | `purchase_items.unit_cost` de compra com `status = confirmed` |
| Destino | `products.cost_price` **e** `product_suppliers.cost_price` do par (produto, `purchases.supplier_id`) se o vínculo existir |
| Sem vínculo PS | Atualiza só `products.cost_price` |
| Momento | Transição `draft → confirmed` (UI, XML ou BLING/RPC) |
| Cancelamento | **Não** recalcula nem reverte custo |
| Draft / itens unbound | Não atualizam custo até confirmação |
| Farol | Sem mudança de fórmula: continua `COALESCE(ps.cost_price, p.cost_price)` (FEATURE 005) |
| Média / BI | Fora desta feature (017 ou 015.1) |

## Fora de escopo

- Custo médio ponderado  
- Recalcular custo ao cancelar  
- Criar `product_suppliers` automaticamente só para gravar custo  
- Alterar views Farol além do uso já existente de `cost_price`  
- UI dedicada de “histórico de custo”  
- Proteger `cost_price` editado manualmente contra overwrite da próxima NFe (próxima confirmação **sempre** sobrescreve)  
- FEATURE 016 (pedido → compra)

## Arquitetura

```
Confirmar compra (status draft → confirmed)
        │
        ▼
Trigger SQL (SECURITY DEFINER)
  fz_apply_last_purchase_cost()
        │
        ├─► UPDATE products.cost_price
        │     por cada purchase_item da compra
        │
        └─► UPDATE product_suppliers.cost_price
              WHERE product_id + supplier_id (= purchases.supplier_id)
              AND company_id
              (no-op se não houver linha)

Cancel confirmed → cancelled: trigger de estoque (012) reverte movimentos;
                             trigger de custo NÃO altera cost_price.
```

Mesma regra para origem `manual` | `xml` | `bling` | futura `farol` — o gatilho é o **status**, não o `source`.

## Componentes

### 1. Função + trigger Postgres

- `fz_apply_last_purchase_cost()` — `AFTER UPDATE OF status ON purchases`  
- Condição: `OLD.status = 'draft' AND NEW.status = 'confirmed'`  
- Para cada `purchase_items` da compra:
  1. `UPDATE products SET cost_price = pi.unit_cost WHERE id = pi.product_id AND company_id = NEW.company_id`
  2. `UPDATE product_suppliers SET cost_price = pi.unit_cost WHERE company_id = NEW.company_id AND product_id = pi.product_id AND supplier_id = NEW.supplier_id`  
     (0 rows se não existir vínculo — ok)
- `SECURITY DEFINER`, `search_path = public`  
- Dual-write FEATURE 003: update em `products.cost_price` já pode espelhar no primary; update explícito no PS do **fornecedor da compra** cobre o caso em que o primary é outro fornecedor.

**Ordem com estoque (012):** indiferente; triggers distintos. Custo não depende de `inventory_movements`.

### 2. Backfill one-shot

Após criar o trigger, migration ou script SQL:

- Para cada `(company_id, product_id)`, achar a compra **confirmed** mais recente que contenha o produto (ordenar por `purchases.issued_at DESC`, `purchases.updated_at DESC`, `purchases.id DESC`)  
- Aplicar o mesmo `unit_cost` → `products` + `product_suppliers` (fornecedor dessa compra)  
- Idempotente: rodar de novo produz o mesmo estado  

Escopo do backfill: todas as confirmed da company (sem limite de janela no MVP).

### 3. App / n8n

- **Nenhuma** mudança obrigatória no client: `confirmPurchase` e RPC `import_purchase_nfe` (UPDATE confirmed) já disparam o trigger.  
- Opcional na plan: teste de integração / doc README.

## Regras de conflito

| Situação | Comportamento |
|----------|----------------|
| Várias linhas do mesmo produto na mesma compra | Usar o `unit_cost` da **última linha processada** no loop (ou `DISTINCT ON` com `MAX(unit_cost)` — **plan deve fixar**: preferir a linha com maior `id` / ordem de insert; se preços diferirem na mesma NF, é dado sujo raro) |
| Duas confirmações no mesmo dia | A mais recente por `updated_at` / ordem do trigger vence |
| `unit_cost = 0` | Grava 0 (não pular) — operador vê e corrige na próxima compra se necessário |
| Produto sem compras confirmadas | `cost_price` permanece como está (BLING/manual) |

**Decisão explícita para a plan:** se a mesma compra tiver o mesmo `product_id` em mais de uma linha com `unit_cost` distintos, usar o da linha com **`purchase_items.id` máximo**.

## Dados / schema

Sem colunas novas no MVP. Opcional futuro: `products.cost_updated_at` / `cost_source` — **não** nesta feature.

## Testes (aceite)

- [ ] Confirmar compra draft com 1 item → `products.cost_price` = `unit_cost`  
- [ ] Com vínculo `product_suppliers` (mesmo supplier da compra) → `ps.cost_price` atualizado  
- [ ] Sem vínculo PS → só `products` muda; nenhum erro  
- [ ] Cancelar compra confirmed → `cost_price` **inalterado**; estoque reverte (012)  
- [ ] RPC BLING com match 100% (insert draft + update confirmed) → custo aplicado  
- [ ] Backfill: produto com histórico confirmed antigo recebe último custo sem reconfirmar  
- [ ] Farol/pedido: valor sugerido reflete novo `COALESCE(ps, p)` após confirm  

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Dual-write 003 vs update PS do supplier da compra | Documentar ordem; testar primary ≠ supplier da NF |
| NFe marketplace já bloqueada (012.1) | Não deve gerar confirmed EBAZAR; backfill não deve reintroduzir se compras foram apagadas |
| Custo 0 na NF | Aceito; monitorar drafts |

## Numeração / sequência

1. Spec (este doc) — aprovada em 2026-08-06  
2. Plan de implementação (quando o usuário pedir)  
3. Implementação (migration trigger + backfill + testes)  
4. Em seguida, no roadmap: FEATURE 016  

## Histórico de decisão

| Data | Decisão |
|------|---------|
| 2026-08-06 | Último custo (não média) |
| 2026-08-06 | Gravar em `products` + `product_suppliers` do fornecedor da compra |
| 2026-08-06 | Cancel não recalcula |
| 2026-08-06 | Trigger no confirm; backfill one-shot incluído no MVP |
| 2026-08-06 | Spec detalhada aprovada para registro; implementação só após plan explícito |
