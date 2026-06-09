-- ============================================================
-- COMPRA PARCIAL — registro por item e por quantidade, com histórico.
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- Pré-requisito: 20260609100000_request_status_parcial.sql (enum 'parcial').
-- ============================================================

-- ---------- Quanto já foi comprado de cada item (estado acumulado) ----------
alter table compras.request_items
  add column if not exists purchased_quantity numeric not null default 0;

-- ---------- Histórico de cada compra parcial ----------
create table if not exists compras.purchase_entries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references compras.purchase_requests(id) on delete cascade,
  request_item_id uuid not null references compras.request_items(id) on delete cascade,
  quantity numeric not null check (quantity > 0),   -- quantidade comprada neste registro
  unit_price numeric not null check (unit_price >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_entries_request on compras.purchase_entries(request_id);
create index if not exists idx_purchase_entries_item    on compras.purchase_entries(request_item_id);

-- ---------- RLS ----------
alter table compras.purchase_entries enable row level security;

-- todo mundo logado lê (mesma visibilidade dos itens/solicitações)
drop policy if exists "pe_select" on compras.purchase_entries;
create policy "pe_select" on compras.purchase_entries
  for select to authenticated using (true);

-- só comprador/admin registra, e sempre em nome próprio
drop policy if exists "pe_insert" on compras.purchase_entries;
create policy "pe_insert" on compras.purchase_entries
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (compras.has_role(auth.uid(), 'comprador') or compras.has_role(auth.uid(), 'admin'))
  );

-- desfazer um lançamento: o próprio autor ou um admin
drop policy if exists "pe_delete" on compras.purchase_entries;
create policy "pe_delete" on compras.purchase_entries
  for delete to authenticated
  using (created_by = auth.uid() or compras.has_role(auth.uid(), 'admin'));
