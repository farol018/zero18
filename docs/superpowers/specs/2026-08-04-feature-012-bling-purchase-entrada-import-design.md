# FEATURE 012 — Importação automática de NFe de entrada (BLING → compras)

**Data:** 2026-08-04  
**Status:** implementada localmente (migrations + n8n + README) — aceite live pendente (SQL Editor + import n8n)  
**Depende de:** FEATURE 009 (compras), FEATURE 011 (pipeline XML / match), PATCH 011.1 (document/gtin)

## Objetivo

Importar **compras** (NFe de entrada) do BLING automaticamente para o Farol, reutilizando o pipeline da FEATURE 011 (`PurchaseImportModel` → match → `purchases` / `purchase_items`), com processamento **no banco** (RPC + triggers).

XML manual da 011 permanece.

## Decisões de produto

| Tema | Decisão |
|------|---------|
| Match 100% (fornecedor + todos os itens) | `status = confirmed` automaticamente |
| Match incompleto | `status = draft` para revisão na UI atual |
| Estoque | Na confirmação (auto ou manual): `inventory_movements` tipo **entrada**. Premissa: NFe de entrada lançada no BLING = mercadoria entrou |
| Origens | BLING automático **e** XML manual (011) |
| Janela sync | Rolante **14 dias** (MVP; sem checkpoint) |
| Escopo documental | **Somente compras**. Devoluções / retornos **não** importam |
| Onde roda a lógica | **Postgres** (RPC). n8n só busca BLING e chama a RPC |
| Fornecedor ausente | **Auto-cria** `suppliers` pelo CNPJ da NFe (`fz_ensure_supplier`; `external_id=nfe-doc:{cnpj}`) |

## Fora de escopo

- Criação automática de **produtos**
- Checkpoint / sync incremental por cursor (fica para evolução)
- PDF, CSV, SEFAZ direto
- Alterações no motor Farol, lista de compra, pedido, `composeLogistics`
- Importar devoluções / NF de retorno
- Reescrever regras de match no n8n (devem viver no banco / espelhar 011)

## Arquitetura

```
BLING
  GET /nfe?tipo=0  (entrada, janela 14 dias)
  GET /nfe/{id}    (detalhe)
       │
       ▼
n8n  farol-bling-sync-compras (novo)
  - OAuth BLING + service_role Supabase
  - Filtra devoluções (natureza/CFOP/flags — ver regras)
  - Chama RPC import_purchase_nfe(company_id, payload)
       │
       ▼
Postgres
  import_purchase_nfe(...)
    1. Normaliza payload → modelo interno (equivalente PurchaseImportModel)
    2. Dedupe: unique (company_id, source, external_id) — external_id = chave NFe 44
    3. Match: document → gtin → supplier_sku → sku → name (sem auto-vínculo ambíguo)
    4. INSERT purchases + purchase_items
       - source = 'bling'
       - status = confirmed se 100% matched, senão draft
    5. Se confirmed: escrever inventory_movements (entrada), idempotente

UI Farol (sem tela nova)
  - Aba Compras: rascunhos pendentes de match
  - Confirm manual / cancel: mesma regra de estoque via trigger
```

XML manual (011):

```
XML → parse/match no app → createDraft(source=xml)
  → usuário confirma → trigger de estoque (mesma regra)
```

## Componentes

### 1. n8n — `farol-bling-sync-compras`

- Espelha o padrão de `farol-bling-sync-vendas`, com `nfe_tipo = 0` (entrada).
- Janela: últimos 14 dias; paginação; detalhe por id.
- Credenciais: `bling_*` + `farol_supabase` (service_role).
- Para cada NFe elegível: `POST`/`rpc` `import_purchase_nfe`.
- Resultado agregado no log do workflow: criadas / confirmadas / draft / skip (duplicata) / rejeitadas (devolução) / erros.
- **Não** implementa matching no Code node.

### 2. RPC — `import_purchase_nfe(p_company_id uuid, p_payload jsonb)`

Entrada mínima do payload (campos canônicos; mapear do JSON BLING no n8n ou na RPC):

- `external_id` (chave 44)
- `invoice_number`, `invoice_series`
- `issued_at` (date)
- `supplier.document`, `supplier.name`
- `items[]`: `gtin`, `supplier_product_code`, `sku`, `name`, `quantity`, `unit_cost`
- Metadados opcionais para filtro de devolução: `natureza`, `cfops[]`, flags BLING se existirem

Comportamento:

1. Validar company + payload mínimo (chave 44, ≥1 item).
2. Se devolução → return `{ status: 'rejected_return' }` sem insert.
3. Se já existe `(company_id, source='bling', external_id)` → return `{ status: 'skipped_duplicate' }`.
4. Resolver `supplier_id` e `product_id` por item (mesma ordem da 011).
5. Insert purchase + items (`company_id` obrigatório; **não** enviar `total_cost` se for generated column).
6. Se todos os itens e o fornecedor casaram → `confirmed`; senão `draft`.
7. Return `{ status, purchase_id, matched_items, unbound_items }`.

Security: `SECURITY DEFINER` com `search_path = public`; executável por `service_role` (n8n). App autenticado **não** precisa chamar esta RPC no MVP (XML continua no client).

### 3. Estoque — trigger em `purchases`

- **AFTER UPDATE OF status** (e opcionalmente cobrir insert já `confirmed` da RPC):
  - `draft → confirmed`: inserir `inventory_movements` entrada por item (quantity, product_id, company_id, reference = purchase/chave).
  - `confirmed → cancelled`: remover ou estornar movimentos daquela compra.
- Idempotência: unique/`ON CONFLICT` em `(company_id, product_id, reference_type, reference_id)` (ou chave equivalente alinhada ao schema atual).
- RLS: policies authenticated de INSERT/UPDATE/DELETE em `inventory_movements` por `profiles.company_id` (já identificadas na homologação 011); trigger preferencialmente `SECURITY DEFINER` para não depender de role do caller.

Premissa de negócio: não há flag separado “recebida” no BLING para este fluxo; entrada lançada = entrou.

### 4. Filtro de devolução

Heurística inicial (ajustável na implementação com amostras reais):

- Excluir se natureza/operação contiver “devoluç” / “retorno” (case-insensitive), **ou**
- CFOP de devolução de compra (ex. família 1.2xx / 2.2xx conforme regras fiscais usadas pelo tenant), **ou**
- Campo/situação BLING que identifique devolução, se existir no detalhe.

Somente **compras** passam na RPC.

### 5. App (mudanças mínimas)

- Nenhuma tela nova obrigatória.
- Confirm/cancel manual passam a acionar a mesma política de estoque (via trigger).
- Labels de status em PT (já feitos na homologação).
- Opcional MVP+: badge/contador de rascunhos `source=bling` pendentes — não bloqueante.

## Modelo de dados

Sem novas tabelas no MVP.

| Campo / objeto | Uso |
|----------------|-----|
| `purchases.source` | `'bling'` no sync; `'xml'` no manual |
| `purchases.external_id` | Chave NFe 44 |
| `purchases.invoice_series` | Série |
| `suppliers.document` / `products.gtin` | Match (PATCH 011.1) |
| `purchase_items.company_id` | Obrigatório no insert (schema live) |
| `purchase_items.total_cost` | Generated no live — não enviar no insert |
| `inventory_movements` | Entrada na confirmação |

Migrations desta feature:

1. RPC `import_purchase_nfe` (+ grants service_role).
2. Trigger confirm/cancel → estoque.
3. Policies write em `inventory_movements` (se ainda não aplicadas).
4. Documentar alinhamento schema live (`company_id`, generated `total_cost`) se migrations 009 estiverem atrás do banco.

## Alinhamento com FEATURE 011

| 011 | 012 |
|-----|-----|
| Parse XML no browser | Parse/normalização do payload BLING na RPC (ou pré-map no n8n → mesmo shape) |
| Match TS (`matchPurchaseImport`) | Match SQL equivalente (mesma ordem e regras SEM GTIN / ambiguidade) |
| `createDraft` client | RPC insert draft/confirmed |
| Confirm manual sem estoque (spec 011) | Confirm (auto/manual) **com** estoque — extensão explícita |

A lib TS de match pode permanecer para o XML; a RPC é a fonte de verdade do sync BLING. Drift de regras deve ser evitado com testes de paridade nos critérios principais (document, gtin, supplier_sku).

## Testes

- SQL/RPC: payload válido → confirmed + movimentos
- SQL/RPC: item sem GTIN no catálogo → draft, zero movimentos
- SQL/RPC: chave duplicada → skip
- SQL/RPC: devolução → rejected, zero insert
- SQL/RPC: cancel confirmed → remove/estorna movimentos
- n8n: dry-run / fixture com 1 NFe entrada (manual no ambiente)
- Não-regressão: sync vendas (saída) intocado; Farol views intocadas
- Paridade: mesmos fixtures de match da 011 (gtin, document, SEM GTIN, ambíguo)

## Aceite

- [ ] Workflow n8n de entradas cria compras `source=bling`
- [ ] Match 100% → confirmed + `inventory_movements` entrada
- [ ] Match incompleto → draft sem estoque
- [ ] Devolução não cria compra
- [ ] Duplicata de chave não duplica
- [ ] XML manual continua funcionando; confirm manual atualiza estoque
- [ ] Cancelamento de confirmed reverte estoque da compra
- [ ] Sync de vendas (saída) e Farol sem regressão

## Riscos e notas

- Schema live já diverge das migrations 009 (`company_id` em items, `total_cost` generated, possível trigger legado de estoque). 012 deve **inspecionar e alinhar** triggers existentes para não duplicar movimentos.
- GTIN duplicado no catálogo impede auto-confirm (igual 011) — higiene de catálogo continua necessária.
- Volume API BLING: segundo consumidor `/nfe` (tipo 0); monitorar cota junto com vendas (tipo 1).
