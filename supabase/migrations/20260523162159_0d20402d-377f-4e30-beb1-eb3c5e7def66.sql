ALTER TABLE public.request_items
  ADD CONSTRAINT request_items_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_request_items_item_id ON public.request_items(item_id);