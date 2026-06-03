# Design System — ERP Solução Móveis (SMERP)

Identidade visual única para todos os apps do ERP. **Compras (`comprasolucao`) é o
repositório de referência.** Apps que seguem este sistema:

- `comprasolucao` — Compras (referência)
- `hora-hora-fabrill` — Produção Hora a Hora
- `bip-solucao` — Expedição / Bipagem
- `erp` — Hub (HTML/CSS puro; consome os mesmos valores de cor/raio/fonte)

> Objetivo: ao circular entre os apps, o usuário sente que **nunca saiu do mesmo
> sistema** — mesma barra lateral, mesma marca, mesma cor, mesma fonte.

---

## Decisões

1. **Navegação:** barra lateral **esquerda recolhível** (shadcn `Sidebar collapsible="icon"`),
   idêntica em todos. Topo com gatilho de recolher + título da página + ações.
2. **Tema:** **somente claro.** Nenhum app define bloco `.dark` (foi removido de
   hora-a-hora e bip). Não usar utilitários `dark:` nem aplicar a classe `dark`.
3. **Marca/cor:** laranja `oklch(0.685 0.165 47)` (≈ `#E8722A`). Fonte **Inter**.

---

## Fontes da verdade (manter idênticas entre os 3 apps React)

| Arquivo | O que é |
|---|---|
| `src/styles.css` (bloco `:root` + `@theme inline`) | Tokens de cor, raio (`--radius: 0.875rem`), fonte. |
| `src/components/AppShell.tsx` | A casca (sidebar + cabeçalho + rodapé). **Arquivo idêntico nos 3.** |
| `src/components/ui/*` | Componentes shadcn/ui (new-york + Radix). |

### Tokens-núcleo (devem ser iguais em todos)
`--radius: 0.875rem` · `--background` · `--foreground` · `--card` · `--primary`
(laranja) · `--secondary` · `--muted` · `--accent` · `--border`/`--input` · `--ring`
· toda a família `--sidebar-*`.

> Tokens **extras** específicos de app são permitidos desde que NÃO alterem os
> núcleo: hora-a-hora tem `--caution`/`--exceed` (severidade de desvio); bip/compras
> têm `--info`/`--success`/`--warning`. Mantê-los.

### Raios (referência rápida)
- Cards (`rounded-xl`) = **18px** · Botões/Inputs (`rounded-md`) = **12px** · base
  (`--radius`, `rounded-lg`) = **14px**. O Hub usa os mesmos valores.

---

## AppShell — contrato

`AppShell` é **apresentacional e genérico** (não importa auth nem nada específico de
app). Cada app monta um wrapper fino que injeta seus dados:

- **Compras:** `src/components/AppLayout.tsx` (guarda de auth + nav por papel + `NotificationsBell` no `headerRight`).
- **Hora a Hora:** `src/routes/_app.tsx` (gate de papel "Aguardando atribuição" + nav PCP/Qualidade/Líder).
- **Bip:** `src/components/AppLayout.tsx` (nav Carregamentos + Administração se `isAdmin`).

Props principais: `brand {logo,title,subtitle}`, `navItems[]`, `pathname`,
`isActive?`, `pageTitle?`, `user?`, `onSignOut?`, `erpUrl`, `headerRight?`.

Telas que **ficam fora** da casca (tela cheia): `login`/`auth` e as telas de tarefa/scan
do bip (`report.$orderId`, `loading.$orderId`).

---

## Como sincronizar (repos separados, sem monorepo)

Ao mudar a identidade, edite **no Compras** e copie para os outros dois:

1. `src/components/AppShell.tsx` → copiar **igual** para `hora-hora-fabrill` e `bip-solucao`.
2. Bloco `:root`/`@theme` de `src/styles.css` → replicar os tokens-núcleo (preservando os extras de cada app).
3. Componentes `src/components/ui/*` alterados → copiar para os demais.

Verificar com `bunx tsc --noEmit` em cada app após copiar.

> Evolução futura (opcional): extrair `AppShell` + tokens para um pacote npm
> compartilhado (`@smerp/ui`) para eliminar a cópia manual.

---

## Pendências de polimento (Fase 4 — não bloqueante)

- Padrão único de **cabeçalho de página** (título + subtítulo + ações) reutilizável.
- Padronizar estados **vazio / carregando / erro** entre telas.
- Toast Sonner: compras e hora-a-hora usam `position="top-right" richColors`; padronizar
  caso o bip passe a usar toasts.
