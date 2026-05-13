
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS purchase_amount numeric(14,2);

INSERT INTO public.cost_centers (code, name) VALUES
  ('CC-007', 'Compras'),
  ('CC-008', 'Manutenção'),
  ('CC-009', 'Logística'),
  ('CC-010', 'Financeiro'),
  ('CC-011', 'Operações')
ON CONFLICT DO NOTHING;
