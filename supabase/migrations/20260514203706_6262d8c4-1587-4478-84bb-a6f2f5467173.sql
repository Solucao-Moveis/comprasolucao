CREATE TABLE public.request_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  item_id uuid,
  description text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_request_items_request_id ON public.request_items(request_id);

ALTER TABLE public.request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ri_select" ON public.request_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ri_insert" ON public.request_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_requests pr
      WHERE pr.id = request_id
        AND (
          (pr.requester_id = auth.uid() AND pr.status = 'pendente')
          OR public.is_sector_approver(auth.uid(), pr.sector_id)
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'comprador'::app_role)
        )
    )
  );

CREATE POLICY "ri_update" ON public.request_items
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.purchase_requests pr
      WHERE pr.id = request_id
        AND (
          (pr.requester_id = auth.uid() AND pr.status = 'pendente')
          OR public.is_sector_approver(auth.uid(), pr.sector_id)
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'comprador'::app_role)
        )
    )
  );

CREATE POLICY "ri_delete" ON public.request_items
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.purchase_requests pr
      WHERE pr.id = request_id
        AND (
          (pr.requester_id = auth.uid() AND pr.status = 'pendente')
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );