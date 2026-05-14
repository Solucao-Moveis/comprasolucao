
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.items(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.recalc_item_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_spent numeric; v_total_qty numeric; v_count integer; v_last timestamptz; v_interval numeric;
BEGIN
  IF NEW.item_id IS NULL THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.purchased_at IS NOT NULL AND NEW.purchase_amount IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.purchased_at IS NOT NULL AND NEW.purchase_amount IS NOT NULL
         AND (OLD.purchased_at IS DISTINCT FROM NEW.purchased_at OR OLD.purchase_amount IS DISTINCT FROM NEW.purchase_amount OR OLD.item_id IS DISTINCT FROM NEW.item_id)) THEN
    SELECT COALESCE(SUM(purchase_amount),0), COALESCE(SUM(quantity),0), COUNT(*), MAX(purchased_at)
      INTO v_total_spent, v_total_qty, v_count, v_last
    FROM public.purchase_requests
    WHERE item_id = NEW.item_id AND purchased_at IS NOT NULL AND purchase_amount IS NOT NULL;
    SELECT AVG(diff) INTO v_interval FROM (
      SELECT EXTRACT(EPOCH FROM (purchased_at - LAG(purchased_at) OVER (ORDER BY purchased_at)))/86400 AS diff
      FROM public.purchase_requests
      WHERE item_id = NEW.item_id AND purchased_at IS NOT NULL
    ) t WHERE diff IS NOT NULL;
    UPDATE public.items SET
      total_spent = v_total_spent, total_quantity = v_total_qty, purchase_count = v_count,
      avg_price = CASE WHEN v_total_qty > 0 THEN v_total_spent / v_total_qty ELSE 0 END,
      last_purchased_at = v_last, avg_interval_days = v_interval, updated_at = now()
    WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pr_recalc_item ON public.purchase_requests;
CREATE TRIGGER pr_recalc_item AFTER INSERT OR UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.recalc_item_stats();

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_requester uuid; v_number text;
BEGIN
  SELECT requester_id, number INTO v_requester, v_number FROM public.purchase_requests WHERE id = NEW.request_id;
  IF v_requester IS NOT NULL AND v_requester <> NEW.user_id THEN
    INSERT INTO public.notifications(user_id, request_id, title, body)
    VALUES (v_requester, NEW.request_id, 'Novo comentário em ' || COALESCE(v_number,'sua solicitação'), LEFT(NEW.content, 200));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cm_notify ON public.request_comments;
CREATE TRIGGER cm_notify AFTER INSERT ON public.request_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

CREATE OR REPLACE FUNCTION public.notify_request_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_changed boolean := false;
BEGIN
  IF NEW.requester_id = v_actor THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications(user_id, request_id, title, body)
    VALUES (NEW.requester_id, NEW.id, 'Status atualizado: ' || NEW.status, COALESCE(NEW.number,'') || ' agora está ' || NEW.status);
    RETURN NEW;
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.unit IS DISTINCT FROM OLD.unit OR NEW.needed_by IS DISTINCT FROM OLD.needed_by
     OR NEW.justification IS DISTINCT FROM OLD.justification OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id OR NEW.sector_id IS DISTINCT FROM OLD.sector_id
     OR NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.purchase_amount IS DISTINCT FROM OLD.purchase_amount THEN
    v_changed := true;
  END IF;
  IF v_changed THEN
    INSERT INTO public.notifications(user_id, request_id, title, body)
    VALUES (NEW.requester_id, NEW.id, 'Solicitação ' || COALESCE(NEW.number,'') || ' foi editada', 'Campos da sua solicitação foram alterados.');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pr_notify_changes ON public.purchase_requests;
CREATE TRIGGER pr_notify_changes AFTER UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_request_changes();
