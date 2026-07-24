-- ============================================================
-- SLA DE ENTREGA — prazo-limite automático (decided_at + prazo do
-- tipo_compra/urgente) comparado com a previsão real do fornecedor.
-- Se a previsão passar do prazo-limite, marca "fora do prazo
-- acordado" e exige justificativa do comprador.
-- Schema: compras (banco unificado SMERP).
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

alter table compras.purchase_requests
  add column if not exists fora_do_prazo_acordado boolean not null default false;

alter table compras.purchase_requests
  add column if not exists atraso_justificativa text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchase_requests_atraso_justificativa_check'
  ) then
    alter table compras.purchase_requests
      add constraint purchase_requests_atraso_justificativa_check
      check (
        (not fora_do_prazo_acordado)
        or (atraso_justificativa is not null and length(trim(atraso_justificativa)) > 0)
      );
  end if;
end $$;

-- Substitui set_expected_delivery pra calcular o prazo-limite (decided_at +
-- 15d matéria-prima / 5d insumos / 1d se urgente — urgente tem prioridade)
-- e exigir justificativa quando a previsão ultrapassa esse limite.
drop function if exists compras.set_expected_delivery(uuid, date);

create or replace function compras.set_expected_delivery(p_request_id uuid, p_date date, p_justificativa text default null)
returns void
language plpgsql
security definer
set search_path = compras, public
as $$
declare
  v_decided_at timestamptz;
  v_tipo compras.purchase_type;
  v_urgente boolean;
  v_limite date;
  v_fora boolean;
begin
  if not (compras.has_role(auth.uid(), 'comprador') or compras.has_role(auth.uid(), 'admin')) then
    raise exception 'apenas comprador ou admin pode preencher a previsão de entrega';
  end if;

  select decided_at, tipo_compra, urgente
    into v_decided_at, v_tipo, v_urgente
    from compras.purchase_requests
   where id = p_request_id;

  v_fora := false;
  if v_decided_at is not null and p_date is not null then
    if v_urgente then
      v_limite := v_decided_at::date + 1;
      v_fora := p_date > v_limite;
    elsif v_tipo = 'materia_prima' then
      v_limite := v_decided_at::date + 15;
      v_fora := p_date > v_limite;
    elsif v_tipo = 'insumos_outros' then
      v_limite := v_decided_at::date + 5;
      v_fora := p_date > v_limite;
    end if;
  end if;

  if v_fora and (p_justificativa is null or length(trim(p_justificativa)) = 0) then
    raise exception 'a previsão de entrega está fora do prazo acordado — informe a justificativa';
  end if;

  update compras.purchase_requests
     set expected_delivery_date = p_date,
         fora_do_prazo_acordado = v_fora,
         atraso_justificativa = case when v_fora then trim(p_justificativa) else null end
   where id = p_request_id;
end;
$$;

revoke all on function compras.set_expected_delivery(uuid, date, text) from public;
grant execute on function compras.set_expected_delivery(uuid, date, text) to authenticated;
