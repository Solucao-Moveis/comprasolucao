# Deploy no EasyPanel (Docker)

> Estes arquivos (`Dockerfile`, `.dockerignore`, `server.mjs`) são **adicionais** e
> **não afetam** o deploy existente no Lovable (Cloudflare). São ignorados por ele.

## Como funciona

O `vite build` gera:

- `dist/client/` → assets estáticos
- `dist/server/server.js` → handler SSR + server functions (export `fetch`)

Na Cloudflare a plataforma serve os assets automaticamente. Ao auto-hospedar,
o `server.mjs` (rodando em Bun) faz isso: tenta servir o arquivo estático e,
se não existir, encaminha para o handler SSR.

## Passos no EasyPanel

1. **Create App** → tipo **App**.
2. **Source**: aponte para este repositório Git (branch `main`) ou faça upload.
3. **Build**: selecione **Dockerfile** (na raiz do projeto). Sem configuração extra.
4. **Port / Proxy**: aponte o domínio para a porta **3000**.
5. **Environment** (variáveis de runtime — aba Environment):

   | Variável                    | De onde tirar                                  |
   |-----------------------------|------------------------------------------------|
   | `SUPABASE_URL`              | `https://wbxnaemipiqxtaledycl.supabase.co`     |
   | `SUPABASE_PUBLISHABLE_KEY`  | Chave **anon** (Supabase → Settings → API)     |
   | `SUPABASE_SERVICE_ROLE_KEY` | Chave **service_role** (Supabase → Settings → API) — **secreta** |

   > A `SERVICE_ROLE_KEY` é usada por operações de admin no servidor
   > (`client.server.ts`). Mantenha-a apenas no servidor, nunca exponha no cliente.

6. **Deploy**.

## Observações

- As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (públicas) são
  embutidas no bundle do cliente **em tempo de build**, lidas do arquivo `.env`
  já versionado. Se mudá-las, é preciso **rebuildar** a imagem.
- A porta pode ser alterada via env `PORT` (padrão `3000`).

## Testar localmente

```bash
docker build -t comprasolucao .
docker run --rm -p 3000:3000 \
  -e SUPABASE_URL="https://wbxnaemipiqxtaledycl.supabase.co" \
  -e SUPABASE_PUBLISHABLE_KEY="<anon key>" \
  -e SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
  comprasolucao
# abra http://localhost:3000
```
