-- ============================================================
-- PEDIDOS DE COMPRA como lista (substitui o campo de texto livre
-- purchase_order_number, onde vários números eram digitados juntos
-- separados por "/") + nota fiscal anexada por pedido.
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

-- ---------- Tabela ----------
create table if not exists compras.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references compras.purchase_requests(id) on delete cascade,
  number text not null,
  invoice_path text,               -- caminho no storage da NF; null até anexar
  invoice_uploaded_by uuid references auth.users(id),
  invoice_uploaded_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_orders_request on compras.purchase_orders(request_id);

-- ---------- RLS (mesmo padrão de compras.purchase_entries) ----------
alter table compras.purchase_orders enable row level security;

drop policy if exists "po_select" on compras.purchase_orders;
create policy "po_select" on compras.purchase_orders
  for select to authenticated using (true);

drop policy if exists "po_insert" on compras.purchase_orders;
create policy "po_insert" on compras.purchase_orders
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (compras.has_role(auth.uid(), 'comprador') or compras.has_role(auth.uid(), 'admin'))
  );

-- update é necessário pra anexar a NF depois de criado o registro
drop policy if exists "po_update" on compras.purchase_orders;
create policy "po_update" on compras.purchase_orders
  for update to authenticated
  using (compras.has_role(auth.uid(), 'comprador') or compras.has_role(auth.uid(), 'admin'))
  with check (compras.has_role(auth.uid(), 'comprador') or compras.has_role(auth.uid(), 'admin'));

drop policy if exists "po_delete" on compras.purchase_orders;
create policy "po_delete" on compras.purchase_orders
  for delete to authenticated
  using (created_by = auth.uid() or compras.has_role(auth.uid(), 'admin'));

-- ---------- View de agregação (pra exibir/buscar na lista sem trocar a query toda) ----------
create or replace view compras.v_request_po_numbers as
select request_id, string_agg(number, ' / ' order by created_at) as numbers_text
from compras.purchase_orders
group by request_id;

grant select on compras.v_request_po_numbers to authenticated;

-- ---------- Migração dos dados existentes ----------
-- Separa o texto livre atual (ex.: "15228 / 15232 / 15227") em uma linha por número.
-- Idempotente: só roda pra pedidos que ainda não têm linha em purchase_orders.
insert into compras.purchase_orders (request_id, number, created_by, created_at)
select pr.id, trim(part), pr.requester_id, pr.created_at
from compras.purchase_requests pr,
     unnest(regexp_split_to_array(pr.purchase_order_number, '[/,]')) as part
where pr.purchase_order_number is not null
  and trim(part) <> ''
  and not exists (
    select 1 from compras.purchase_orders po where po.request_id = pr.id
  );

-- Nota: a coluna compras.purchase_requests.purchase_order_number e a função
-- compras.set_purchase_order ficam mantidas por enquanto, sem uso pela UI nova,
-- até confirmar que a migração foi validada em produção.
