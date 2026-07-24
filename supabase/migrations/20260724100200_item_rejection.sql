-- ============================================================
-- REJEIÇÃO POR ITEM NO MOMENTO DA APROVAÇÃO — o aprovador pode
-- negar itens específicos de uma solicitação com múltiplos itens
-- e aprovar o restante. Itens rejeitados ficam de fora do cálculo
-- de "comprado"/"finalizado" (ver requests.$id.index.tsx).
-- Schema: compras (banco unificado SMERP).
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- Não precisa de RLS nova: a policy "ri_update" já existente
-- (is_sector_approver / admin / comprador, sem restrição de
-- status) já cobre esta escrita.
-- ============================================================

alter table compras.request_items
  add column if not exists rejected boolean not null default false;

alter table compras.request_items
  add column if not exists rejection_reason text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'request_items_rejection_reason_check'
  ) then
    alter table compras.request_items
      add constraint request_items_rejection_reason_check
      check (
        (not rejected)
        or (rejection_reason is not null and length(trim(rejection_reason)) > 0)
      );
  end if;
end $$;
