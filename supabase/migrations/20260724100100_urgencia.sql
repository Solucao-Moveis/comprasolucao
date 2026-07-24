-- ============================================================
-- URGÊNCIA — flag + justificativa obrigatória quando marcada.
-- Schema: compras (banco unificado SMERP).
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

alter table compras.purchase_requests
  add column if not exists urgente boolean not null default false;

alter table compras.purchase_requests
  add column if not exists urgencia_justificativa text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchase_requests_urgencia_justificativa_check'
  ) then
    alter table compras.purchase_requests
      add constraint purchase_requests_urgencia_justificativa_check
      check (
        (not urgente)
        or (urgencia_justificativa is not null and length(trim(urgencia_justificativa)) > 0)
      );
  end if;
end $$;
