# PATCH 011.1 — Enriquecimento sync BLING (document + gtin)

**Data:** 2026-07-29  
**Tipo:** infraestrutura n8n (não é feature de compras)  
**FEATURE 011:** intocada (`PurchaseImportModel` → Matching → Sheet → Draft)

## Campos confirmados (API BLING v3)

| Recurso | Campo canônico | Fallbacks no parser |
|---------|----------------|---------------------|
| Contato | `numeroDocumento` | `cpfCnpj`, `documento`, `cnpj`, `cpf` |
| Produto (detalhe) | `gtin` | `gtinEmbalagem` (+ `tributacao.*` se existir) |

Fontes: OpenAPI / SDKs Bling v3 (`IFindResponse.numeroDocumento`); schema produto detalhe com `gtin` / `gtinEmbalagem`.

**Nota:** a listagem `GET /contatos` pode omitir `numeroDocumento` em alguns ambientes. Se `com_documento` vier 0 no Sync, inspecionar `amostra_contato.keys` no Resultado e validar um item live.

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| `n8n/farol-bling-sync-produtos.json` | `suppliers.document` |
| `n8n/farol-bling-vincular-fornecedores.json` | `products.gtin` oportunista + document no upsert do detalhe |
| `n8n/farol-bling-backfill-gtin.json` | **novo**, temporário |
| `n8n/README-bling-sync.md` | mapeamento atualizado |

## Como executar

1. Reimportar no n8n os 3 JSON (ou atualizar nós Code).
2. Credenciais: `bling_vitor` + `farol_supabase` (service_role).
3. Rodar **Sync Produtos** → checar `com_documento` e SQL `suppliers.document`.
4. Rodar **Vincular Fornecedores** → checar `gtins_patched` nos pendentes da fila.
5. Rodar **Backfill GTIN** repetidamente até `motivo: nenhum_produto_sem_gtin`.
6. 2ª execução do backfill deve processar 0 candidatos com GTIN válido (idempotência).

## Remover o temporário

Após backlog zerado: desative ou delete o workflow no n8n e pode apagar `n8n/farol-bling-backfill-gtin.json` do repo quando homologado.

## Migration

Nenhuma — colunas já criadas na FEATURE 011.
