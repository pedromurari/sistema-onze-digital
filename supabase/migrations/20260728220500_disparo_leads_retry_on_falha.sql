ALTER TABLE public.disparo_leads
  ADD COLUMN IF NOT EXISTS reenviado_apos_falha BOOLEAN NOT NULL DEFAULT false;
