-- ============================================================
-- Limpeza de itens-lixo do catálogo (compras.items).
-- Origem: items_insert ficou aberto pra qualquer autenticado entre
-- 20260523233121 e 20260523233150 e voltou a ficar aberto na 233150;
-- itens genéricos foram cadastrados ad-hoc nesse intervalo.
-- Schema: compras (banco unificado SMERP).
-- FK de request_items.item_id / purchase_requests.item_id é ON DELETE
-- SET NULL, então apagar aqui não quebra pedidos antigos (a descrição
-- do pedido é um snapshot em texto, independente do catálogo).
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

delete from compras.items
where code = 'XXXX'
   or trim(description) ilike any (array[
     'APARELHO DE TELEFONE FIXO',
     'Copia Colorida',
     'Despesa geral',
     'PLASTICO PARA PLASTIFICAÇÃO A4',
     'Despesa'
   ]);
