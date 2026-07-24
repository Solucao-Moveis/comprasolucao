-- ============================================================
-- TIPO DE COMPRA — classificação obrigatória (formulário) da
-- solicitação: Matéria-prima vs. Insumos/Outros. Alimenta o
-- cálculo de prazo de SLA da Fase 2 (não implementado aqui).
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

do $$ begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'purchase_type' and n.nspname = 'compras'
  ) then
    create type compras.purchase_type as enum ('materia_prima', 'insumos_outros');
  end if;
end $$;

-- NÃO NOT NULL: solicitações históricas recebem classificação
-- retroativa via script à parte (ver classificar-tipo-compra.mjs),
-- não por default aqui. O formulário novo (requests.new.tsx) já
-- exige o preenchimento pra tudo que for criado daqui pra frente.
alter table compras.purchase_requests
  add column if not exists tipo_compra compras.purchase_type;
