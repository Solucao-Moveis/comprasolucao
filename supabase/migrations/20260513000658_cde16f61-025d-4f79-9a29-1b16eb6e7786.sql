
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  request_id UUID,
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notif_insert_auth" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "notif_delete_own_or_admin" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
