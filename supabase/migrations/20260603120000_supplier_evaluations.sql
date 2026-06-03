-- ============================================================
-- AVALIAÇÃO DE FORNECEDORES E INSUMOS (ISO 9001:2015 9.1.3 / P-04)
-- Schema: compras  (banco unificado SMERP — o app usa db.schema='compras')
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

-- ---------- ENUM de classificação ----------
do $$ begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'evaluation_class' and n.nspname = 'compras'
  ) then
    create type compras.evaluation_class as enum ('otimo', 'bom', 'regular', 'insuficiente');
  end if;
end $$;

-- ---------- Sequência de numeração (AF-xxxx/ano) ----------
create table if not exists compras.evaluation_sequences (
  year int primary key,
  last_number int not null default 0
);

-- ---------- Tabela principal ----------
create table if not exists compras.supplier_evaluations (
  id uuid primary key default gen_random_uuid(),
  number text,
  -- vínculo opcional com a entrega/solicitação avaliada
  request_id uuid references compras.purchase_requests(id) on delete set null,
  -- cabeçalho do formulário
  supplier text not null,
  nf text,
  evaluation_date date not null,
  evaluator_name text not null,                 -- "Assinante" (nome digitado)
  evaluator_id uuid not null references auth.users(id),
  -- questionário (Sim = true / Não = false)
  q1_conforme boolean not null,                 -- 01 requisitos técnicos (40)
  q2_prazo boolean not null,                    -- 02 prazo (30)
  q3_quantidade boolean not null,               -- 03 quantidade (10)
  q4_conservacao boolean not null,              -- 04 conservação (20)
  -- entradas das deduções graduadas
  days_late int not null default 0,             -- Q02: dias de atraso
  pct_missing numeric not null default 0,       -- Q03: % faltante
  quality_issues int not null default 0,        -- Q04: nº de quesitos
  -- resultado
  total_points int not null,
  classification compras.evaluation_class not null,
  returned boolean not null default false,      -- Q01 Não → produto devolvido
  approved boolean not null,                    -- ☑ Aprovado / ☐ Não Aprovado
  observation text,
  pdf_path text,                                -- caminho do PDF arquivado no storage
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_supplier_evaluations_request  on compras.supplier_evaluations(request_id);
create index if not exists idx_supplier_evaluations_supplier on compras.supplier_evaluations(supplier);
create index if not exists idx_supplier_evaluations_created  on compras.supplier_evaluations(created_at desc);

-- ---------- Numeração AF-xxxx/ano (espelha generate_request_number) ----------
create or replace function compras.generate_evaluation_number()
returns trigger language plpgsql security definer set search_path = compras, public
as $$
declare
  yr int := extract(year from now());
  next_num int;
begin
  insert into compras.evaluation_sequences(year, last_number) values (yr, 1)
  on conflict (year) do update set last_number = evaluation_sequences.last_number + 1
  returning last_number into next_num;
  new.number := 'AF-' || lpad(next_num::text, 4, '0') || '/' || yr;
  return new;
end $$;

drop trigger if exists trg_generate_evaluation_number on compras.supplier_evaluations;
create trigger trg_generate_evaluation_number
  before insert on compras.supplier_evaluations
  for each row when (new.number is null)
  execute function compras.generate_evaluation_number();

-- ---------- updated_at (reusa compras.set_updated_at) ----------
drop trigger if exists trg_se_updated on compras.supplier_evaluations;
create trigger trg_se_updated before update on compras.supplier_evaluations
  for each row execute function compras.set_updated_at();

-- ---------- RLS ----------
alter table compras.supplier_evaluations enable row level security;
alter table compras.evaluation_sequences enable row level security;

drop policy if exists "se_select" on compras.supplier_evaluations;
create policy "se_select" on compras.supplier_evaluations
  for select to authenticated using (true);

drop policy if exists "se_insert" on compras.supplier_evaluations;
create policy "se_insert" on compras.supplier_evaluations
  for insert to authenticated
  with check (
    evaluator_id = auth.uid()
    and (compras.has_role(auth.uid(), 'comprador') or compras.has_role(auth.uid(), 'admin'))
  );

drop policy if exists "se_update" on compras.supplier_evaluations;
create policy "se_update" on compras.supplier_evaluations
  for update to authenticated
  using (evaluator_id = auth.uid() or compras.has_role(auth.uid(), 'admin'))
  with check (evaluator_id = auth.uid() or compras.has_role(auth.uid(), 'admin'));

drop policy if exists "se_delete" on compras.supplier_evaluations;
create policy "se_delete" on compras.supplier_evaluations
  for delete to authenticated
  using (evaluator_id = auth.uid() or compras.has_role(auth.uid(), 'admin'));

-- evaluation_sequences: só admin lê/escreve direto (a função é SECURITY DEFINER)
drop policy if exists "evalseq_admin" on compras.evaluation_sequences;
create policy "evalseq_admin" on compras.evaluation_sequences
  for all to authenticated
  using (compras.has_role(auth.uid(), 'admin'))
  with check (compras.has_role(auth.uid(), 'admin'));

-- ---------- Storage: bucket privado para os PDFs arquivados ----------
insert into storage.buckets (id, name, public)
values ('supplier-evaluations', 'supplier-evaluations', false)
on conflict (id) do nothing;

drop policy if exists "compras se_storage_select" on storage.objects;
create policy "compras se_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'supplier-evaluations' and (
      (auth.uid())::text = (storage.foldername(name))[1]
      or compras.has_role(auth.uid(), 'admin')
      or compras.has_role(auth.uid(), 'comprador')
    )
  );

drop policy if exists "compras se_storage_insert" on storage.objects;
create policy "compras se_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'supplier-evaluations'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "compras se_storage_delete" on storage.objects;
create policy "compras se_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'supplier-evaluations'
    and (auth.uid()::text = (storage.foldername(name))[1] or compras.has_role(auth.uid(), 'admin'))
  );
