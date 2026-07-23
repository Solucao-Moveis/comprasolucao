-- ============================================================
-- Re-trava o INSERT em compras.items pra admin/comprador.
-- A policy tinha sido apertada em 20260523233121 e afrouxada de
-- volta 30s depois em 20260523233150 ("auth.uid() is not null"),
-- o que deixou qualquer usuário autenticado cadastrar item novo
-- no catálogo direto pelo form de solicitação — origem provável
-- dos itens-lixo limpos em 20260721120000.
-- Schema: compras (banco unificado SMERP).
-- Idempotente: pode ser reexecutado com segurança.
-- ============================================================

drop policy if exists items_insert on compras.items;

create policy items_insert on compras.items for insert to authenticated
  with check (compras.has_role(auth.uid(), 'admin') or compras.has_role(auth.uid(), 'comprador'));
