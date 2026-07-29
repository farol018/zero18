# Auditoria técnica — Integração BLING / Notas Fiscais (Entrada × Saída)

**Data:** 2026-07-29  
**Escopo:** Somente leitura. Nenhum código alterado.  
**Fonte:** `n8n/*.json`, `n8n/README-bling-sync.md`, migrations Supabase, frontend FAROL.

Canvas: `canvases/auditoria-bling-nf-entrada.canvas.tsx`

---

## Resposta direta à suspeita

**Por que parece haver consumo anormal de Notas de Entrada?**

No código versionado do FAROL:

1. **Não existe sync de NF de Entrada (`tipo=0`).**
2. O único pipeline de NF chama **`GET /nfe` com `tipo=1` (saída)** para gerar **consumo** (`inventory_movements.type = saida`).
3. **Não há integração SEFAZ direta** (sem webhook SEFAZ, sem polling SEFAZ).
4. O consumo pesado de API documentado é **`/nfe` (listagem + detalhe)** na janela rolante de **14 dias**, até **~520 chamadas/execução** — isso pode aparecer no BLING como uso alto da API de Notas, mesmo sendo saída.

Hipóteses se o painel BLING mostrar **entrada** especificamente:

| Hipótese | Evidência no repo |
|----------|-------------------|
| Cota BLING agrega `/nfe` (entrada+saída) | FAROL martela `/nfe` diariamente |
| Diagnóstico `sem_filtro` | `farol-bling-diagnostico-nfe.json` testa `/nfe` sem `tipo` |
| Instância n8n live divergente do JSON | README ≠ cron JSON; precisa conferir n8n.zerodezoitodigital.com.br |
| Outro sistema / UI BLING / manifesto SEFAZ | Fora deste repositório |

---

## 1. Como o FAROL obtém notas?

### Diagrama as-is

```
SEFAZ
  │  (autorização / manifesto — fora do FAROL)
  ▼
BLING (ERP armazena NF-e)
  │
  │  OAuth2 API v3  —  SEM webhook no repo
  ▼
n8n (poll manual/cron)
  │
  ├─ Sync Vendas ──► GET /nfe?tipo=1&dataEmissao…  +  GET /nfe/{id}
  │                     └─► inventory_movements (saida)
  ├─ Sync Estoque ─► GET /estoques/saldos/{deposito}
  │                     └─► current_stock
  ├─ Sync Produtos ► GET /contatos, /produtos
  │                     └─► suppliers, products
  └─ (diagnósticos) ► testes pontuais /nfe ou /pedidos/vendas
  ▼
Supabase
  ▼
FAROL (React) lê views stock_analysis / farol_*
```

**Não existe:** Webhook BLING → FAROL · SEFAZ → FAROL · Sync de entrada → `purchases`.

---

## 2. Consumo desnecessário da API?

**Sim, no caminho de saídas:**

| Padrão | Presente? |
|--------|-----------|
| Chamadas duplicadas na mesma janela | Sim — cada run re-lista 14 dias |
| Sync completo desnecessário | Parcial — capped, mas reprocessa histórico recente |
| Só novidades | Não |
| Polling excessivo | Depende do schedule live; JSON = 1×/dia vendas; README sugere 4h |
| Consultas sem filtro | Diagnóstico NFe: teste `sem_filtro` |
| Loops | Paginação fixa 1..N páginas (mesmo vazias até o cap) |

---

## 3. Risco de limite BLING?

| Endpoint | Freq. (JSON) | Paginação | Filtro data | lastUpdate / modifiedSince |
|----------|--------------|-----------|-------------|----------------------------|
| `GET /nfe` | Sync Vendas cron `30 1 * * *` | até 20×100 | `dias_atras=14` | **Não** |
| `GET /nfe/{id}` | até 500/run | — | — | **Não** |
| `GET /estoques/saldos/{id}` | manual | lotes 30 | snapshot | **Não** |
| `GET /produtos`, `/contatos` | diário 05:30 | até 50+30 pág | — | **Não** |

Limite citado no README: ~**3 req/s**. Vendas usa **4s** entre calls; estoque **15s**.

**Pior caso Sync Vendas:** `20 + 500 = 520` calls ≈ **35 min** só de espera BLING.

---

## 4. Idempotência

| Mecanismo | Uso |
|-----------|-----|
| `reference_type` | `bling_nfe` |
| `reference_id` | `{nfeId}-{índiceItem}` |
| Upsert | `(company_id, product_id, reference_type, reference_id)` |
| Chave SEFAZ | **Não** |
| Hash / UUID nota | **Não** (só id BLING) |

**Risco:** reordem de itens na NF muda índice → possível duplicidade lógica; cancelamento não remove movimento.

---

## 5. Notas canceladas / entrada / devolução

| Evento | Tratado? |
|--------|----------|
| Cancelamento | Não |
| Inutilização | Não |
| Carta de correção | Não |
| Devolução | Não |
| Entrada × saída | Só saída (`nfe_tipo=1`); entrada ignorada |
| `Math.abs(qty)` | Quantidade negativa vira saída positiva |

---

## 6. Como o estoque é atualizado?

| Fonte | Efeito |
|-------|--------|
| Sync Estoque | **Upsert snapshot** em `current_stock` (sobrescreve quantidade) |
| Sync Vendas | **Insere/atualiza movimentos** `saida` (não recalcula saldo a partir da NF) |
| Farol | Views somam `inventory_movements` (consumo) + leem `current_stock` |

Não há “recalcular tudo a partir de todas as notas” no app. Estoque atual ≠ soma de movimentos no pipeline atual.

---

## 7. Sincronização incremental?

**Não (verdadeiro incremental).**

Controle atual: **janela rolante `dias_atras` + upsert**.  
Campo de checkpoint tipo `lastUpdate`: **ausente**.

---

## 8. Workflows n8n

| Nome | Trigger | Endpoints | Destino |
|------|---------|-----------|---------|
| FAROL — BLING Sync Vendas | Manual + `30 1 * * *` | `/nfe`, `/nfe/{id}` | `inventory_movements` |
| FAROL — BLING Sync Estoque | Manual | `/estoques/saldos…` | `current_stock` |
| FAROL — BLING Sync Produtos | Manual + `30 5 * * *` | `/contatos`, `/produtos` | `suppliers`, `products` |
| FAROL — Vincular Fornecedores | Manual | `/produtos/{id}` | `suppliers`, `products` |
| FAROL — BLING Diagnostico NFe | Manual | `/nfe` (3 variantes) | — |
| FAROL — BLING Diagnostico Vendas | Manual | `/pedidos/vendas` | — |
| FAROL — BLING Diagnóstico | Manual | `/produtos` tipos | — |
| FAROL — BLING Contar Produtos | Manual | `/produtos` | — |

---

## 9. Banco — quem escreve

| Tabela | Escritor |
|--------|----------|
| `products` | Sync Produtos, Vincular |
| `suppliers` | Sync Produtos, Vincular |
| `current_stock` | Sync Estoque |
| `inventory_movements` | Sync Vendas |
| `companies.last_sync_at` | Sync Produtos |
| `purchases` / `purchase_items` | **Só app manual** (FEATURE 009) — **não** BLING |
| `import_jobs` | Referenciado no app; sync n8n atual não grava jobs de NF no JSON analisado |

---

## 10. Código app

| Área | Papel na sync BLING |
|------|---------------------|
| Hooks Farol | **Só leitura** das views/tabelas |
| Edge functions / cron no repo | **Não há** |
| Webhooks no app | **Não há** |
| `CompanyContext` | Lê `import_jobs` / companies (status sync) |

Toda escrita BLING está no **n8n**.

---

## 11. Gargalos

### Crítico

1. **Reprocessamento de 14 dias + até 500 detalhes `/nfe` por run**  
   - Impacto: cota BLING / timeouts  
   - Risco: sync incompleto por caps  
   - Correção futura: incremental + checkpoint  

2. **Possível conflito de rate limit Estoque↔Vendas**  
   - Impacto: `TOO_MANY_REQUESTS`  
   - Correção: filas exclusivas / horários  

### Importante

3. **Sem cancelamento de NF** → consumo fantasma  
4. **Diagnóstico `/nfe` sem filtro** pode tocar entradas  
5. **README desatualizado** (frequência 4h vs cron JSON)  
6. **Sem chave SEFAZ** na idempotência  

### Melhoria

7. Estoque sem cron no JSON  
8. Caps silenciosos (notas além de 500 detalhes)  
9. Separar pipeline futuro de entradas → `purchases`  

---

## 12. Fluxo ideal (não implementado)

```
BLING
  → buscar só documentos alterados desde checkpoint
  → persistir checkpoint
  → detalhar só novidades
  → validar idempotência (chave SEFAZ + item)
  → saídas → inventory_movements (+ remover canceladas)
  → entradas → purchases/purchase_items (módulo futuro)
  → estoque → snapshot menos frequente ou delta
  → NÃO reprocessar histórico completo a cada run
```

---

## Arquivos envolvidos

- `n8n/farol-bling-sync-vendas.json` — **principal consumidor `/nfe`**
- `n8n/farol-bling-sync-estoque.json`
- `n8n/farol-bling-sync-produtos.json`
- `n8n/farol-bling-vincular-fornecedores.json`
- `n8n/farol-bling-diagnostico-nfe.json`
- `n8n/README-bling-sync.md`
- `supabase/migrations/*inventory_movements*`

---

## Próximo passo sugerido (operacional, sem código)

1. No n8n live: confirmar `nfe_tipo`, cron real e execuções manuais sobrepostas.  
2. No painel BLING: separar métricas `/nfe` saída vs entrada.  
3. Conferir se outro app/credencial usa a mesma OAuth.  
4. Só então desenhar correção incremental (fora desta auditoria).
