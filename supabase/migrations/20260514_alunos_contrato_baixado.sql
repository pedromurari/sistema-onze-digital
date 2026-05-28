-- Marca se o contrato assinado foi baixado/salvo pela equipe
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS contrato_baixado BOOLEAN DEFAULT FALSE;
