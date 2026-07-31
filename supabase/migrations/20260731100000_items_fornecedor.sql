-- ============================================================
-- VÍNCULO ITEM ↔ FORNECEDOR — liga o item do catálogo ao cadastro de
-- fornecedores (CNPJ). Sem vínculo automático: fica NULL até o vínculo
-- em massa via planilha (CNPJ + nome) ser construído numa etapa futura.
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

alter table compras.items
  add column if not exists fornecedor_id uuid references compras.fornecedores(id) on delete set null;

create index if not exists idx_items_fornecedor on compras.items(fornecedor_id);
