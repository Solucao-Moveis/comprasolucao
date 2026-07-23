-- ============================================================
-- PREVISÃO DE ENTREGA DO FORNECEDOR — preenchida pelo comprador.
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

-- ---------- Coluna da previsão de entrega ----------
alter table compras.purchase_requests
  add column if not exists expected_delivery_date date;

-- ---------- Salvar a previsão sem afrouxar o UPDATE geral da tabela ----------
-- Diferente do número do pedido de compra (compras.set_purchase_order, aberto pra
-- qualquer autenticado), aqui a trava é por papel: só comprador/admin preenche.
create or replace function compras.set_expected_delivery(p_request_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = compras, public
as $$
begin
  if not (compras.has_role(auth.uid(), 'comprador') or compras.has_role(auth.uid(), 'admin')) then
    raise exception 'apenas comprador ou admin pode preencher a previsão de entrega';
  end if;
  update compras.purchase_requests
     set expected_delivery_date = p_date
   where id = p_request_id;
end;
$$;

revoke all on function compras.set_expected_delivery(uuid, date) from public;
grant execute on function compras.set_expected_delivery(uuid, date) to authenticated;
