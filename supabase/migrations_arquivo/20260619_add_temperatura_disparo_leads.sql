ALTER TABLE public.disparo_leads
  ADD COLUMN IF NOT EXISTS temperatura text NOT NULL DEFAULT 'frio'
    CHECK (temperatura IN ('quente', 'morno', 'frio'));

CREATE INDEX IF NOT EXISTS idx_disparo_leads_temperatura
  ON public.disparo_leads (campanha_id, temperatura);
