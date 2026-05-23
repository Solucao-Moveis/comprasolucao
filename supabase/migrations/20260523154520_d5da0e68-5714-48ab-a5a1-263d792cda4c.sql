
ALTER TABLE public.request_items
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS expected_price numeric;
