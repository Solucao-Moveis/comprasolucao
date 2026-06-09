-- ============================================================
-- Status 'parcial' (compra parcial) no enum de status da solicitação.
-- Schema: compras (banco unificado SMERP — o app usa db.schema='compras').
-- Rodar no SQL Editor do Supabase Studio do SMERP.
-- Idempotente. ADD VALUE roda fora de transação; deixe em migration separada.
-- ============================================================

ALTER TYPE compras.request_status ADD VALUE IF NOT EXISTS 'parcial' AFTER 'aprovado';
