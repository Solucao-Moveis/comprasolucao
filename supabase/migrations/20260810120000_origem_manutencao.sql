-- ============================================================
-- ORIGEM DA SOLICITAÇÃO — de qual sistema/registro externo ela veio.
-- Hoje usado por manutencao.criar_pedido_compra_os (SC aberta direto
-- da aba "Atender OS" do Pro-Care), mas o desenho é genérico pra
-- qualquer outro app do SMERP que vier a criar SC via RPC no futuro.
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP. Idempotente.
-- ============================================================

alter table compras.purchase_requests
  add column if not exists origem_sistema text,
  add column if not exists origem_referencia text;
