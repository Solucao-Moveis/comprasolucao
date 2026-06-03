-- ============================================================
-- Permite que o próprio avaliador exclua a avaliação que criou
-- (além do admin). Schema compras (SMERP). Idempotente.
-- ============================================================

drop policy if exists "se_delete" on compras.supplier_evaluations;
create policy "se_delete" on compras.supplier_evaluations
  for delete to authenticated
  using (evaluator_id = auth.uid() or compras.has_role(auth.uid(), 'admin'));
