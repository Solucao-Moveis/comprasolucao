CREATE OR REPLACE FUNCTION public.recalc_item_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_spent numeric; v_total_qty numeric; v_count integer; v_last timestamptz; v_interval numeric; v_avg_unit numeric;
BEGIN
  IF NEW.item_id IS NULL THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.purchased_at IS NOT NULL AND NEW.purchase_amount IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.purchased_at IS NOT NULL AND NEW.purchase_amount IS NOT NULL
         AND (OLD.purchased_at IS DISTINCT FROM NEW.purchased_at OR OLD.purchase_amount IS DISTINCT FROM NEW.purchase_amount OR OLD.item_id IS DISTINCT FROM NEW.item_id)) THEN
    SELECT COALESCE(SUM(purchase_amount),0), COALESCE(SUM(quantity),0), COUNT(*), MAX(purchased_at),
           AVG(CASE WHEN quantity > 0 THEN purchase_amount / quantity END)
      INTO v_total_spent, v_total_qty, v_count, v_last, v_avg_unit
    FROM public.purchase_requests
    WHERE item_id = NEW.item_id AND purchased_at IS NOT NULL AND purchase_amount IS NOT NULL;
    SELECT AVG(diff) INTO v_interval FROM (
      SELECT EXTRACT(EPOCH FROM (purchased_at - LAG(purchased_at) OVER (ORDER BY purchased_at)))/86400 AS diff
      FROM public.purchase_requests
      WHERE item_id = NEW.item_id AND purchased_at IS NOT NULL
    ) t WHERE diff IS NOT NULL;
    UPDATE public.items SET
      total_spent = v_total_spent, total_quantity = v_total_qty, purchase_count = v_count,
      avg_price = COALESCE(v_avg_unit, 0),
      last_purchased_at = v_last, avg_interval_days = v_interval, updated_at = now()
    WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END $function$;

-- Recalcular preço médio de todos os itens já existentes com base no novo critério
UPDATE public.items i SET
  avg_price = COALESCE(s.avg_unit, 0),
  updated_at = now()
FROM (
  SELECT item_id,
         AVG(CASE WHEN quantity > 0 THEN purchase_amount / quantity END) AS avg_unit
  FROM public.purchase_requests
  WHERE item_id IS NOT NULL AND purchased_at IS NOT NULL AND purchase_amount IS NOT NULL
  GROUP BY item_id
) s
WHERE i.id = s.item_id;