-- Add missing columns to npa_evento_leads
ALTER TABLE public.npa_evento_leads
  ADD COLUMN IF NOT EXISTS comprou_material boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS turma text DEFAULT 'unica',
  ADD COLUMN IF NOT EXISTS valor_material numeric DEFAULT 0;

-- Add missing columns to npa_eventos
ALTER TABLE public.npa_eventos
  ADD COLUMN IF NOT EXISTS valor_ingresso numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS meta_faturamento numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_presentes numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_ingressos numeric DEFAULT 0;
