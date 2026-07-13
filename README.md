# FAROL Zero18

Sistema de **estoque médio** e **sugestão de compra**, integrado ao BLING via n8n.

## Setup

```bash
npm install
npm run dev
```

### Variáveis (`.env`)

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave anon |
| `VITE_COMPANY_ID` | UUID da empresa no Farol |
| `VITE_SKIP_AUTH` | `true` = acesso direto (single tenant); `false` = exige Supabase Auth |

### Migrations (rodar no SQL Editor do Supabase)

1. `supabase/migrations/20260706180000_bling_integration.sql`
2. `supabase/migrations/20260706200000_farol_production_ready.sql`

### Integração BLING

Ver `n8n/README-bling-sync.md` — importar workflows e executar: **Produtos → Estoque → Vendas**.

## Arquitetura

- **Frontend:** React + TanStack Query
- **Cálculo:** `src/lib/farolCalculations.ts` (fonte única da regra de negócio)
- **Dados:** Supabase (`products`, `current_stock`, `inventory_movements`)
- **ERP:** BLING API v3 via n8n

## Testes

```bash
npm test
```
