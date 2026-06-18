-- ============================================================
-- PEDIDO DE COMPRA — número do pedido por solicitação.
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

-- ---------- Coluna do número do pedido de compra ----------
alter table compras.purchase_requests
  add column if not exists purchase_order_number text;

-- ---------- Salvar o pedido sem afrouxar o UPDATE da tabela ----------
-- A política de UPDATE de purchase_requests é restrita (dono/aprovador/admin)
-- e o RLS não restringe por coluna. Para deixar QUALQUER usuário logado
-- preencher apenas o número do pedido, expomos uma função SECURITY DEFINER
-- que mexe só nessa coluna.
create or replace function compras.set_purchase_order(p_request_id uuid, p_number text)
returns void
language plpgsql
security definer
set search_path = compras, public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update compras.purchase_requests
     set purchase_order_number = nullif(btrim(p_number), '')
   where id = p_request_id;
end;
$$;

revoke all on function compras.set_purchase_order(uuid, text) from public;
grant execute on function compras.set_purchase_order(uuid, text) to authenticated;
