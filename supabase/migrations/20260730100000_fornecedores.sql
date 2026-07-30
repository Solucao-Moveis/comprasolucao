-- ============================================================
-- CADASTRO DE FORNECEDORES — dados oficiais buscados por CNPJ na
-- BrasilAPI (brasilapi.com.br/api/cnpj/v1/{cnpj}), congelados no
-- momento do cadastro (sem edição manual nem refresh automático).
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

create table if not exists compras.fornecedores (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique,                     -- só dígitos, 14 chars
  razao_social text not null,
  nome_fantasia text,
  situacao_cadastral int,
  descricao_situacao_cadastral text,             -- "ATIVA" / "BAIXADA" / etc.
  data_situacao_cadastral date,
  natureza_juridica text,
  porte text,                                    -- "DEMAIS" / "MICRO EMPRESA" / ...
  capital_social numeric,
  data_inicio_atividade date,
  cnae_fiscal int,
  cnae_fiscal_descricao text,
  cnaes_secundarios jsonb,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cep text,
  municipio text,
  uf text,
  ddd_telefone_1 text,
  ddd_telefone_2 text,
  email text,
  opcao_pelo_simples boolean,                    -- true = Simples Nacional
  opcao_pelo_mei boolean,
  qsa jsonb,                                     -- sócios, array bruto da API
  regime_tributario jsonb,                       -- histórico por ano, array bruto
  raw_response jsonb not null,                   -- resposta completa da BrasilAPI, sem perder nada
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_fornecedores_razao_social on compras.fornecedores(razao_social);

-- ---------- RLS ----------
alter table compras.fornecedores enable row level security;

-- todo mundo logado lê (mesma visibilidade dos itens/solicitações)
drop policy if exists "fornecedores_select" on compras.fornecedores;
create policy "fornecedores_select" on compras.fornecedores
  for select to authenticated using (true);

-- qualquer usuário logado pode cadastrar, sempre em nome próprio
drop policy if exists "fornecedores_insert" on compras.fornecedores;
create policy "fornecedores_insert" on compras.fornecedores
  for insert to authenticated
  with check (created_by = auth.uid());

-- correção de erro (ex: CNPJ digitado errado) é apagar e recadastrar — só admin apaga
drop policy if exists "fornecedores_delete" on compras.fornecedores;
create policy "fornecedores_delete" on compras.fornecedores
  for delete to authenticated
  using (compras.has_role(auth.uid(), 'admin'));

-- Sem policy de update: dado congelado por design, nem admin edita pela API.
