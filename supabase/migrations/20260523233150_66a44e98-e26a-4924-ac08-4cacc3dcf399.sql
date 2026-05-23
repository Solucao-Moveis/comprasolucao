
DROP POLICY IF EXISTS items_insert ON public.items;
CREATE POLICY items_insert ON public.items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
