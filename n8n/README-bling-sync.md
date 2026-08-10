# FAROL — Sincronização BLING → Supabase (n8n)

Integração do [BLING API v3](https://developer.bling.com.br/bling-api) com o Farol Zero18 via n8n self-hosted.

| Item | Valor |
|------|-------|
| **company_id** | `04c9b2c3-1c6e-439b-949a-486e4917b13c` |
| **Supabase** | `https://ilrebasidmyltziuibyc.supabase.co` |
| **n8n** | `https://n8n.zerodezoitodigital.com.br` |
| **OAuth BLING** | [authorize](https://www.bling.com.br/Api/v3/oauth/authorize) |

## Pré-requisitos

1. Rodar as migrations no Supabase:
   - `supabase/migrations/20260706180000_bling_integration.sql`
   - `supabase/migrations/20260706200000_farol_production_ready.sql`
2. Credenciais no n8n (já configuradas por você):
   - **BLING** — OAuth2 API v3 (`oAuth2Api`)
   - **Supabase** — service role (`supabaseApi`), ex.: `farol_supabase`
3. Importar os workflows JSON desta pasta (produtos, estoque, vendas, compras, etc.).

## Workflows

| Arquivo | O que faz | Agendamento sugerido |
|---------|-----------|----------------------|
| `farol-bling-sync-produtos.json` (v14 / PATCH 011.1) | `/contatos` → `suppliers` (todos, + `document`) + `/produtos` → catálogo | 1×/dia (05:30) |
| `farol-bling-vincular-fornecedores.json` (v8 / PATCH 011.1) | Detalhe BLING → upsert `contato` + `supplier_id` + `purchase_multiple` + `gtin` (oportunista) | após Sync Produtos |
| `farol-bling-backfill-gtin.json` (**temporário**) | Catálogo `gtin IS NULL` → `GET /produtos/{id}` → PATCH `gtin` | manual, até zerar backlog |
| `farol-bling-sync-estoque.json` | Saldo atual → `current_stock` | a cada 4h |
| `farol-bling-sync-vendas.json` | NF-e saída séries 1 e 4 → `inventory_movements` (14 dias) | a cada 4h / 1h30 |
| `farol-bling-sync-compras.json` (FEATURE 012) | NF-e entrada (`tipo=0`) → RPC `import_purchase_nfe` (14 dias) | a cada 4h |

## Mapeamento BLING → Supabase

### Produtos (`GET /produtos`)

| BLING | Supabase |
|-------|----------|
| `id` | `products.external_id` |
| `codigo` | `products.sku` |
| `nome` | `products.name` |
| `precoCusto` | `products.cost_price` |
| `unidade` | `products.unit` |
| `fornecedor.id` | `products.supplier_id` (via `suppliers.external_id`) |

### Fornecedores (`GET /contatos`)

| BLING | Supabase |
|-------|----------|
| `id` | `suppliers.external_id` |
| `nome` | `suppliers.name` |
| `numeroDocumento` (fallback: `cpfCnpj`, `documento`) | `suppliers.document` (somente dígitos; omitido se vazio) |

A listagem `/contatos` **não** traz o tipo Fornecedor de forma confiável — o sync grava **todos** os contatos em `suppliers`. O vínculo real produto↔fornecedor vem do **Vincular** (`GET /produtos/{id}` → `fornecedor.id`).

### GTIN (`GET /produtos/{id}` — PATCH 011.1)

| BLING | Supabase | Onde |
|-------|----------|------|
| `gtin` (fallback `gtinEmbalagem`) | `products.gtin` | Vincular (quando a fila já detalha) + Backfill temporário |

- Fila do Vincular **não** muda (continua `supplier_id` / `purchase_multiple`).
- Nunca grava string vazia / `null` sobre GTIN ou documento já válidos (campo omitido no payload).
- Backfill: ver `farol-bling-backfill-gtin.json` — remover após esgotar o catálogo.

### Estoque (`GET /estoques/saldos`)

| BLING | Supabase |
|-------|----------|
| saldo por produto | `current_stock.quantity` |

### Vendas (`GET /nfe` séries 1 e 4, v11)

| BLING | Supabase |
|-------|----------|
| item da NF-e (tipo saída) | `inventory_movements` (`type = saida`) |
| `nfe.id` + índice do item | `reference_id` (`{nfeId}-{idx}`) |
| — | `reference_type = bling_nfe` |

O workflow v12 evita timeout (~1h09 da instância n8n):
- `modo_teste = 0` em produção
- Intervalo BLING **4s**
- `dias_atras = 14` (histórico de NF)
- `nfe_max_detalhe = 500`, `vendas_max_paginas = 20`
- Match produto por **SKU** (`codigo` da NF) + `external_id`
- Listagem sem `serie` → fila de detalhe; série filtrada no detalhe

Filtros: `tipo = 1` (saída), `nfe_series = 1,4`, `dias_atras = 14`.

### Compras (`GET /nfe` tipo entrada, FEATURE 012)

O workflow `farol-bling-sync-compras.json` importa **NF-e de entrada** (compras) do BLING para a aba Compras do Farol via RPC Postgres — **sem match de produto/fornecedor no n8n**.

| Campo Config | Valor | Uso |
|--------------|-------|-----|
| `nfe_tipo` | `0` | 0 = entrada (compra) |
| `nfe_series` | *(vazio)* | Aceita qualquer série do fornecedor |
| `dias_janela` | `3` | Janela rolante de emissão. Com ~95% marketplace, mesmo 5 dias ainda truncava em 10 mil notas |
| `compras_max_paginas` | `100` | Páginas de `GET /nfe` (100 notas cada). Marketplace é ~95% do volume, então listagem curta trunca antes de alcançar as compras |
| `nfe_max_detalhe` | `250` | Máx. detalhes `GET /nfe/{id}` por execução (evita timeout ~1h40) |
| `bling_interval_ms` | `3000` | Intervalo entre calls BLING (ms) |
| `modo_teste` | `0` | `1` limita a `nfe_limite` notas (dry-run parcial) |
| `nfe_naturezas_devolucao` | *(vazio)* | IDs de natureza de operação forçados como devolução (`22,33`). Só necessário se `/naturezas-operacoes` estiver indisponível |

Fluxo:

1. Nó **BLING - Naturezas** (`GET /naturezas-operacoes?limite=100`) carrega as naturezas da conta e marca como devolução as que têm `devolu`/`retorno` na descrição.
2. Lista BLING `GET /nfe?tipo=0` com paginação (até 100 páginas) e janela de 3 dias. Se `nfes_lista_total` bater cravado em `compras_max_paginas × 100`, a listagem truncou — encurte `dias_janela` ou suba o teto de páginas.
3. **Antes do detalhe:** pula EBAZAR/ML na lista por chave NFe (CNPJ raiz `03007331`), CNPJ do `contato`, ou nome (`ebazar` / `mercado livre`) — assim o teto `nfe_max_detalhe` não é gasto só em marketplace.
4. **Antes do detalhe:** pula devoluções pelo `naturezaOperacao.id` da listagem (IDs do passo 1 + `nfe_naturezas_devolucao`). Nota sem natureza na listagem segue para o detalhe (o filtro por CFOP/natureza continua valendo lá).
5. Detalha notas sem itens na listagem (`GET /nfe/{id}`), intervalo BLING ~3s.
6. Code **Montar payloads RPC** mapeia chave NFe, fornecedor (`contato`/`emitente`), itens (`gtin`, `codigo`, `quantidade`, `valorUnitario`) — **CFOP por item** (`it.cfop`) agregado em `cfops`.
7. Devoluções/retornos e marketplace: soft-skip no n8n; RPC também rejeita (`rejected_return` / `rejected_marketplace`).
8. `POST /rest/v1/rpc/import_purchase_nfe` com credencial `farol_supabase` (service_role).
9. Nó **Resultado** agrega: `confirmed`, `draft`, `skipped_duplicate`, `rejected_return`, `rejected_marketplace`, `rejected_no_match`, `error`, `ignoradas_marketplace_lista`, `ignoradas_devolucao_lista`.

Diagnóstico do filtro de devolução no **Resultado**:

| Campo | Leitura |
|-------|---------|
| `naturezas_carregadas` | Quantas naturezas vieram do BLING. `0` = endpoint sem permissão → use `nfe_naturezas_devolucao` |
| `naturezas_devolucao_ids` | IDs em uso no filtro da listagem |
| `ignoradas_devolucao_lista` | Devoluções barradas **antes** de gastar detalhe (é o ganho) |
| `sem_natureza_lista` | Notas cuja listagem não trouxe natureza (ainda gastam detalhe) |
| `naturezas_devolucao_detectadas` | `id:qtd` das devoluções que escaparam e só foram pegas no detalhe — copie esses IDs para `nfe_naturezas_devolucao` |

**Timeout:** a instância n8n costuma matar runs ~1h40. Não subir `nfe_max_detalhe` acima de ~300 sem baixar o intervalo; o cron 4h esvazia a janela em várias execuções.

Match 100% → `confirmed` + estoque (trigger); incompleto → `draft`; duplicata → `skipped_duplicate`.

**Pré-requisito:** migrations FEATURE 012 aplicadas no Supabase (`import_purchase_nfe` + trigger estoque + rejeição marketplace).

Após importar no n8n, ligue `bling_vitor` + `farol_supabase` nos nós HTTP e rode manualmente com `modo_teste=1` antes de ativar o agendamento 4h.

Após importar vendas, rode no Supabase (janela de consumo do Farol):

```sql
UPDATE companies
SET consumption_window_days = 14
WHERE id = '04c9b2c3-1c6e-439b-949a-486e4917b13c';
```

### Múltiplos de compra (`purchase_multiple`)

- Sync Produtos **não** sobrescreve o campo (edição no Farol permanece).
- Vincular Fornecedores (v7) lê **itens p/caixa** no detalhe BLING e grava só se o valor atual for `1`.
- Na Análise do Farol ainda dá para editar na mão.

## Como conectar as credenciais (passo a passo)

O BLING (`bling_vitor`) **já está conectado** nas Credentials. Falta **ligar nos nós Code** do workflow.

### A) Criar credencial Supabase (se ainda não tiver)

1. n8n → **Credentials** → **Add credential**
2. Tipo: **Supabase API**
3. Nome: `farol_supabase`
4. **Host:** `https://ilrebasidmyltziuibyc.supabase.co`
5. **Service Role Secret:** Supabase → Settings → API → chave `service_role`
6. **Save**

### B) Ligar nos nós do workflow

No workflow **FAROL — BLING Sync Produtos**, repita em **Sync fornecedores** e **Sync produtos**:

1. **Clique no nó** (caixa `{}`)
2. Painel direito → role até o fim
3. **Credential to connect with:**
   - **OAuth2 API** → `bling_vitor`
   - **Supabase API** → `farol_supabase`
4. **Save** no workflow

Mesma coisa nos workflows de **Estoque**, **Vendas** e **Compras** (nós HTTP BLING + Supabase).

### C) Testar

1. Clique **Executar manualmente** → **Execute workflow**
2. Todos os nós ficam verdes
3. Nó **Resultado:** `Fornecedores: X | Produtos: Y`

## Importar no n8n

1. Acesse `https://n8n.zerodezoitodigital.com.br`
2. **Workflows → Import from File**
3. Importe os 3 JSON
4. Em cada nó **Code** (`Sync fornecedores`, `Sync produtos`, etc.), selecione `bling_vitor` + `farol_supabase` (ver seção acima)
5. No workflow de **Compras**, confira também o nó **BLING - Naturezas** (HTTP): credencial `bling_vitor`
6. No nó **Config**, confirme `company_id` e `supabase_url`
7. Ative os workflows

## Ordem de execução (primeira vez)

1. **Produtos** — cria `suppliers` + `products`
2. **Estoque** — preenche `current_stock`
3. **Vendas** — preenche movimentações de saída
4. **Compras** (FEATURE 012) — importa NF-e entrada via RPC (requer fornecedores com `document` cadastrado)

Depois disso, o app Farol passa a mostrar o farol atualizado.

## Rate limit BLING

A API limita ~**3 req/s**. O sync de vendas usa **8s** entre chamadas BLING (listar + detalhe NF-e).

## Depósito de estoque (RajLog)

O sync usa `GET /estoques/saldos/{deposito_id}` (v9) — o BLING já devolve o saldo **só do RajLog** (`14888008180`), sem filtrar `depositos[]` no código.

**Rate limit:** aguarde 2 min, pare Vendas, rode só Estoque. Retry automático após 2 min.

Depois de alterar, rode **FAROL — BLING Sync Estoque** de novo.

## Vendas (consumo) — NF-e séries 1 e 4

O sync de **vendas** (`farol-bling-sync-vendas.json` v8) lê **notas fiscais de saída** no BLING, não pedidos de venda:

| Campo Config | Valor | Uso |
|--------------|-------|-----|
| `nfe_series` | `1,4` | Só notas das séries 1 e 4 |
| `nfe_tipo` | `1` | 1 = saída, 0 = entrada |
| `dias_atras` | `14` | Janela de emissão (`dataEmissaoInicial` / `dataEmissaoFinal`) |

Campo `notas_ignoradas_serie` no Resultado mostra notas fora das séries permitidas.

**Importante:** após reimportar o workflow v8, limpe saídas antigas (pedidos e NF-e) e rode vendas de novo:

```sql
DELETE FROM inventory_movements
WHERE company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c'
  AND reference_type IN ('bling_pedido_venda', 'bling_nfe');
```

Depois execute **FAROL — BLING Sync Vendas**.

## Teste manual

1. Execute **FAROL — BLING Sync Produtos** manualmente
2. No Supabase, verifique:
   ```sql
   SELECT count(*) FROM products WHERE company_id = '04c9b2c3-1c6e-439b-949a-486e4917b13c';
   ```
3. Execute estoque e vendas
4. Abra o Farol — aba **Pedido** e **Análise**

## Troubleshooting

| Problema | Solução |
|----------|---------|
| OAuth expirado | Reautorize a credencial BLING no n8n |
| Upsert falha 409 | Rode a migration de índices únicos |
| Farol “sem consumo” | Rode workflow de vendas; confirme NF-e séries 1/4 nos últimos 14 dias; escopo OAuth **Notas Fiscais** |
| `movimentos` > 0 mas `saidas` = 0 no SQL | Rode `20260708200000_ensure_inventory_movements_upsert.sql`; reimporte workflow vendas v4; confira `posts_fail` no nó Resultado |
| `posts_fail` > 0, erro `unique_external_reference_company` | Reimporte workflow vendas v6 (não envia `external_reference`) e/ou rode `20260708210000_drop_inventory_external_ref_unique.sql` |
| Produto sem fornecedor no pedido | Produto sem `fornecedor` no BLING ou fornecedor não sincronizado |
