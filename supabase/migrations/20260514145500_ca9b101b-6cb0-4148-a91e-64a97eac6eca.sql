
-- Expand notify_request_changes to cover decision/purchase/arrival fields and always notify even when status changed too
CREATE OR REPLACE FUNCTION public.notify_request_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_actor uuid := auth.uid(); v_changed boolean := false;
BEGIN
  IF NEW.requester_id = v_actor THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications(user_id, request_id, title, body)
    VALUES (NEW.requester_id, NEW.id, 'Status atualizado: ' || NEW.status, COALESCE(NEW.number,'') || ' agora está ' || NEW.status);
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.unit IS DISTINCT FROM OLD.unit OR NEW.needed_by IS DISTINCT FROM OLD.needed_by
     OR NEW.justification IS DISTINCT FROM OLD.justification OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id OR NEW.sector_id IS DISTINCT FROM OLD.sector_id
     OR NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.purchase_amount IS DISTINCT FROM OLD.purchase_amount
     OR NEW.decision_note IS DISTINCT FROM OLD.decision_note OR NEW.approver_id IS DISTINCT FROM OLD.approver_id
     OR NEW.purchased_at IS DISTINCT FROM OLD.purchased_at OR NEW.arrived_at IS DISTINCT FROM OLD.arrived_at THEN
    v_changed := true;
  END IF;
  IF v_changed THEN
    INSERT INTO public.notifications(user_id, request_id, title, body)
    VALUES (NEW.requester_id, NEW.id, 'Solicitação ' || COALESCE(NEW.number,'') || ' foi editada', 'Campos da sua solicitação foram alterados.');
  END IF;
  RETURN NEW;
END $$;

-- Ensure triggers actually exist (db-triggers showed none)
DROP TRIGGER IF EXISTS trg_pr_notify_changes ON public.purchase_requests;
CREATE TRIGGER trg_pr_notify_changes
AFTER UPDATE ON public.purchase_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_request_changes();

DROP TRIGGER IF EXISTS trg_pr_history ON public.purchase_requests;
CREATE TRIGGER trg_pr_history
AFTER INSERT OR UPDATE ON public.purchase_requests
FOR EACH ROW EXECUTE FUNCTION public.log_request_history();

DROP TRIGGER IF EXISTS trg_pr_number ON public.purchase_requests;
CREATE TRIGGER trg_pr_number
BEFORE INSERT ON public.purchase_requests
FOR EACH ROW WHEN (NEW.number IS NULL)
EXECUTE FUNCTION public.generate_request_number();

DROP TRIGGER IF EXISTS trg_pr_updated_at ON public.purchase_requests;
CREATE TRIGGER trg_pr_updated_at
BEFORE UPDATE ON public.purchase_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pr_recalc_item ON public.purchase_requests;
CREATE TRIGGER trg_pr_recalc_item
AFTER INSERT OR UPDATE ON public.purchase_requests
FOR EACH ROW EXECUTE FUNCTION public.recalc_item_stats();

DROP TRIGGER IF EXISTS trg_comments_notify ON public.request_comments;
CREATE TRIGGER trg_comments_notify
AFTER INSERT ON public.request_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Notify requester when an attachment is added by someone else
CREATE OR REPLACE FUNCTION public.notify_on_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_requester uuid; v_number text;
BEGIN
  SELECT requester_id, number INTO v_requester, v_number FROM public.purchase_requests WHERE id = NEW.request_id;
  IF v_requester IS NOT NULL AND v_requester <> NEW.uploaded_by THEN
    INSERT INTO public.notifications(user_id, request_id, title, body)
    VALUES (v_requester, NEW.request_id, 'Novo anexo em ' || COALESCE(v_number,'sua solicitação'), NEW.filename);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_attachments_notify ON public.request_attachments;
CREATE TRIGGER trg_attachments_notify
AFTER INSERT ON public.request_attachments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_attachment();
