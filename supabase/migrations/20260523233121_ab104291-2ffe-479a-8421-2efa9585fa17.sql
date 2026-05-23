
-- 1. Items table: restrict writes to admin/comprador
DROP POLICY IF EXISTS items_insert ON public.items;
DROP POLICY IF EXISTS items_update ON public.items;
DROP POLICY IF EXISTS items_delete ON public.items;

CREATE POLICY items_insert ON public.items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'comprador'));

CREATE POLICY items_update ON public.items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'comprador'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'comprador'));

CREATE POLICY items_delete ON public.items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Notifications: restrict INSERT to self or admin. (SECURITY DEFINER triggers bypass RLS so notifications still flow.)
DROP POLICY IF EXISTS notif_insert_auth ON public.notifications;
CREATE POLICY notif_insert_auth ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. Storage: restrict request-attachments SELECT to uploader, request owner, approver, comprador, or admin
DROP POLICY IF EXISTS att_storage_select ON storage.objects;
CREATE POLICY att_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'request-attachments' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'comprador')
      OR EXISTS (
        SELECT 1 FROM public.request_attachments ra
        JOIN public.purchase_requests pr ON pr.id = ra.request_id
        WHERE ra.path = storage.objects.name
          AND (pr.requester_id = auth.uid() OR public.is_sector_approver(auth.uid(), pr.sector_id))
      )
    )
  );

-- 4. Fix set_updated_at search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 5. Realtime authorization: scope notification subscriptions to the recipient
-- Topic convention: "notif-<user_id>-..."
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_realtime_read ON realtime.messages;
CREATE POLICY notif_realtime_read ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE ('notif-' || auth.uid()::text || '-%')
  );
