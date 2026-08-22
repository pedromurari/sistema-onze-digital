-- Add valor_matricula and meta_faturamento to lancamentos
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS valor_matricula numeric DEFAULT 109.90,
  ADD COLUMN IF NOT EXISTS meta_faturamento numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_leads numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_matriculas numeric DEFAULT 0;
