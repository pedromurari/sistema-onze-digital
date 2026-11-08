-- ============================================================
-- IDM Tools — Certificado por Palavras-Chave: adiciona cidade
-- ============================================================

ALTER TABLE public.tentativas_certificado
  ADD COLUMN IF NOT EXISTS cidade TEXT;
