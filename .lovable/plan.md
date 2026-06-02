## Objetivo

Criar uma Supabase Edge Function chamada `export-smerp` que permite exportar todos os dados (tabelas, usuários do auth e arquivos do storage) do Lovable Cloud atual para você levar ao seu Supabase próprio no EasyPanel. **Nenhuma migration será criada. Nenhuma tabela, policy ou dado será alterado.** É puramente uma função de leitura.

## Arquivos a criar

1. **`supabase/functions/export-smerp/index.ts`** — código exato fornecido por você (autenticação via token fixo `smerp_export_7f3a9c2e8b14d6f05a1c9e2b`, lê 12 tabelas, lista usuários do auth, gera signed URLs do bucket `request-attachments`).

2. **`supabase/config.toml`** — adicionar bloco para desabilitar JWT:
   ```toml
   [functions.export-smerp]
   verify_jwt = false
   ```
   (mantendo a linha `project_id` existente intacta).

## Deploy

Após criar os arquivos, faço o deploy explícito da função via `supabase--deploy_edge_functions` com `["export-smerp"]`.

## URL pública resultante

A função ficará disponível em:

```
https://wbxnaemipiqxtaledycl.supabase.co/functions/v1/export-smerp
```

Modos de uso (todos exigem o token):

- **Tabelas** (default):
  `…/export-smerp?token=smerp_export_7f3a9c2e8b14d6f05a1c9e2b`
- **Usuários do auth**:
  `…/export-smerp?token=smerp_export_7f3a9c2e8b14d6f05a1c9e2b&resource=users`
- **Storage (signed URLs de 1h)**:
  `…/export-smerp?token=smerp_export_7f3a9c2e8b14d6f05a1c9e2b&resource=storage`

Token também aceito via header `x-export-token`.

## Observações de segurança

- O token está hardcoded no código (conforme solicitado). Qualquer pessoa com a URL + token consegue ler **tudo** do banco e gerar signed URLs dos anexos. Use-o uma vez para exportar, e depois remova/redesplegue a função, ou troque o token.
- A função usa `SUPABASE_SERVICE_ROLE_KEY` (já existe nos secrets), portanto bypassa RLS — é isso que permite o dump completo.

## Próximo passo após sua aprovação

Switcho para build mode, crio os 2 arquivos, faço deploy e confirmo a URL ativa.
