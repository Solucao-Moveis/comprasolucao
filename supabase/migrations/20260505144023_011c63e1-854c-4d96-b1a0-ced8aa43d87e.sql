
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'aprovador', 'solicitante', 'comprador');
CREATE TYPE public.request_status AS ENUM ('pendente', 'aprovado', 'negado', 'finalizado');
CREATE TYPE public.request_priority AS ENUM ('baixa', 'media', 'alta');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles (separate table)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Sectors with optional approver
CREATE TABLE public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  approver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

-- Cost centers
CREATE TABLE public.cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

-- Sequence per year for numbering
CREATE TABLE public.request_sequences (
  year INT PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
);
ALTER TABLE public.request_sequences ENABLE ROW LEVEL SECURITY;

-- Purchase requests
CREATE TABLE public.purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT UNIQUE,
  sector_id UUID NOT NULL REFERENCES public.sectors(id),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  needed_by DATE NOT NULL,
  justification TEXT NOT NULL,
  priority request_priority NOT NULL DEFAULT 'media',
  cost_center_id UUID REFERENCES public.cost_centers(id),
  status request_status NOT NULL DEFAULT 'pendente',
  approver_id UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.request_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.request_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.request_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  from_status request_status,
  to_status request_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.request_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.request_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.request_attachments ENABLE ROW LEVEL SECURITY;

-- Number generator + trigger
CREATE OR REPLACE FUNCTION public.generate_request_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yr INT := EXTRACT(YEAR FROM now());
  next_num INT;
BEGIN
  INSERT INTO public.request_sequences(year, last_number) VALUES (yr, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = request_sequences.last_number + 1
  RETURNING last_number INTO next_num;
  NEW.number := 'SC-' || LPAD(next_num::TEXT, 4, '0') || '/' || yr;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_generate_request_number
  BEFORE INSERT ON public.purchase_requests
  FOR EACH ROW WHEN (NEW.number IS NULL)
  EXECUTE FUNCTION public.generate_request_number();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_pr_updated BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- History trigger
CREATE OR REPLACE FUNCTION public.log_request_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.request_history(request_id, user_id, action, to_status)
    VALUES (NEW.id, NEW.requester_id, 'created', NEW.status);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.request_history(request_id, user_id, action, from_status, to_status)
    VALUES (NEW.id, auth.uid(), 'status_change', OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pr_history_ins AFTER INSERT ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_request_history();
CREATE TRIGGER trg_pr_history_upd AFTER UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_request_history();

-- New user -> profile + default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'solicitante');
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: is sector approver
CREATE OR REPLACE FUNCTION public.is_sector_approver(_user_id UUID, _sector_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sectors WHERE id = _sector_id AND approver_id = _user_id)
$$;

-- RLS Policies
-- profiles
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- user_roles
CREATE POLICY "roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- sectors / cost_centers: all authenticated read, admin write
CREATE POLICY "sectors_select" ON public.sectors FOR SELECT TO authenticated USING (true);
CREATE POLICY "sectors_admin" ON public.sectors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cc_select" ON public.cost_centers FOR SELECT TO authenticated USING (true);
CREATE POLICY "cc_admin" ON public.cost_centers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- request_sequences (no direct access)
CREATE POLICY "seq_admin" ON public.request_sequences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- purchase_requests
CREATE POLICY "pr_select_all_auth" ON public.purchase_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "pr_insert_self" ON public.purchase_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());
CREATE POLICY "pr_update_owner_or_approver_or_admin" ON public.purchase_requests FOR UPDATE TO authenticated
  USING (
    (requester_id = auth.uid() AND status = 'pendente')
    OR public.is_sector_approver(auth.uid(), sector_id)
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'comprador')
  );
CREATE POLICY "pr_delete_admin" ON public.purchase_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- comments
CREATE POLICY "cm_select" ON public.request_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "cm_insert" ON public.request_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "cm_delete_own_or_admin" ON public.request_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- history
CREATE POLICY "hist_select" ON public.request_history FOR SELECT TO authenticated USING (true);

-- attachments
CREATE POLICY "att_select" ON public.request_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "att_insert" ON public.request_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "att_delete_own_or_admin" ON public.request_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Storage bucket for attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('request-attachments', 'request-attachments', false);

CREATE POLICY "att_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'request-attachments');
CREATE POLICY "att_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'request-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "att_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'request-attachments' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));
