-- ============================================================
-- VÍNCULO ITEM ↔ PEDIDO DE COMPRA — permite ligar cada pedido de
-- compra aos itens (e quantidades) que ele cobre, pra dar baixa
-- automática na chegada (chegada por pedido em vez de item a item).
-- Um mesmo item pode ter partes vinculadas a pedidos diferentes.
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- Pré-requisito: 20260721120300_purchase_orders.sql, 20260721120400_arrival_partial.sql.
-- ============================================================

-- ---------- Vínculo item x pedido, com a quantidade que aquele pedido cobre ----------
create table if not exists compras.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references compras.purchase_orders(id) on delete cascade,
  request_item_id uuid not null references compras.request_items(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_po_items_po   on compras.purchase_order_items(purchase_order_id);
create index if not exists idx_po_items_item on compras.purchase_order_items(request_item_id);

-- ---------- RLS ----------
alter table compras.purchase_order_items enable row level security;

drop policy if exists "poi_select" on compras.purchase_order_items;
create policy "poi_select" on compras.purchase_order_items
  for select to authenticated using (true);

drop policy if exists "poi_insert" on compras.purchase_order_items;
create policy "poi_insert" on compras.purchase_order_items
  for insert to authenticated
  with check (compras.has_role(auth.uid(), 'comprador') or compras.has_role(auth.uid(), 'admin'));

drop policy if exists "poi_delete" on compras.purchase_order_items;
create policy "poi_delete" on compras.purchase_order_items
  for delete to authenticated
  using (compras.has_role(auth.uid(), 'comprador') or compras.has_role(auth.uid(), 'admin'));

-- ---------- Marca que aquele pedido já deu baixa (chegada registrada em lote) ----------
alter table compras.purchase_orders
  add column if not exists arrived_at timestamptz;

-- ---------- Rastreabilidade: de qual pedido veio essa chegada (nulo = lançamento manual item a item) ----------
alter table compras.arrival_entries
  add column if not exists purchase_order_id uuid references compras.purchase_orders(id) on delete set null;
