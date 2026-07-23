-- ============================================================
-- CHEGADA PARCIAL — registro por item e por quantidade, espelhando
-- compras.purchase_entries (compra parcial). O pedido só finaliza
-- (purchase_requests.arrived_at) quando TODOS os itens chegarem 100%.
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- Pré-requisito: 20260609100100_purchase_entries.sql (purchased_quantity).
-- ============================================================

-- ---------- Quanto já chegou de cada item (estado acumulado) ----------
alter table compras.request_items
  add column if not exists arrived_quantity numeric not null default 0;

-- ---------- Histórico de cada chegada parcial ----------
create table if not exists compras.arrival_entries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references compras.purchase_requests(id) on delete cascade,
  request_item_id uuid not null references compras.request_items(id) on delete cascade,
  quantity numeric not null check (quantity > 0),   -- quantidade chegada neste registro
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_arrival_entries_request on compras.arrival_entries(request_id);
create index if not exists idx_arrival_entries_item    on compras.arrival_entries(request_item_id);

-- ---------- RLS (mesmo padrão de compras.purchase_entries) ----------
alter table compras.arrival_entries enable row level security;

drop policy if exists "ae_select" on compras.arrival_entries;
create policy "ae_select" on compras.arrival_entries
  for select to authenticated using (true);

drop policy if exists "ae_insert" on compras.arrival_entries;
create policy "ae_insert" on compras.arrival_entries
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (compras.has_role(auth.uid(), 'comprador') or compras.has_role(auth.uid(), 'admin'))
  );

drop policy if exists "ae_delete" on compras.arrival_entries;
create policy "ae_delete" on compras.arrival_entries
  for delete to authenticated
  using (created_by = auth.uid() or compras.has_role(auth.uid(), 'admin'));
