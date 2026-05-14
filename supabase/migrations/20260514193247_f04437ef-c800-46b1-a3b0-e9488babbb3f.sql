DROP POLICY IF EXISTS items_delete_admin ON public.items;
CREATE POLICY items_delete ON public.items FOR DELETE TO authenticated USING (true);